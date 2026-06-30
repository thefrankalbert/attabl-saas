import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentStatus } from '@/types/admin.types';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { createOrderService } from './order.service';

/**
 * Payment service - split / partial / refund tenders (audit findings H2 + H8,
 * Phase 3 of the order->payment refonte).
 *
 * The simple full-payment fast path stays in order.service markPaid. This service
 * handles the multi-tender cases: a check settled across several payments, an
 * under-payment that leaves an order 'partial', and refunds (offsetting rows).
 *
 * Every tender is one append-only row in the payments ledger. payment_status on
 * orders is recomputed from the ledger after each write - never the other way
 * round. All queries are tenant-scoped.
 *
 * MONEY UNITS: every amount here (orders.total, orders.tip_amount,
 * payments.amount, and the derived due/net/completed/refunded) is an integer in
 * the currency's MINOR units. Comparisons and sums are plain integer arithmetic -
 * no per-currency rounding is needed (an integer minor amount is already exact).
 */

/** Minimal order shape needed to compute what is owed and to recompute status. */
interface PaymentOrderRow {
  id: string;
  total: number | null;
  tip_amount: number | null;
  display_currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  session_id: string | null;
  status: string | null;
}

/** One tender row from the ledger. */
export interface PaymentTender {
  id: string;
  amount: number;
  method: string;
  status: 'completed' | 'refunded';
  createdBy: string | null;
  createdAt: string;
}

/** Aggregated payment state for an order, derived from the ledger. */
export interface PaymentSummary {
  orderId: string;
  /** Amount owed = total (excl. tip) + tip, in integer minor units. */
  due: number;
  /** Sum of completed tenders. */
  completed: number;
  /** Sum of refunded tenders. */
  refunded: number;
  /** completed - refunded. */
  net: number;
  paymentStatus: PaymentStatus;
  tenders: PaymentTender[];
}

interface TenderInput {
  amount: number;
  method: string;
  createdBy?: string | null;
}

const ORDER_COLUMNS =
  'id, total, tip_amount, display_currency, payment_status, paid_at, session_id, status';

export function createPaymentService(supabase: SupabaseClient) {
  /**
   * Amount owed for an order: total (excl. tip per project convention) + tip,
   * in integer minor units. Both columns are already minor integers, so this is
   * a plain integer add (Math.round is a defensive no-op against any stray
   * non-integer that slipped in).
   */
  function dueFor(
    order: Pick<PaymentOrderRow, 'total' | 'tip_amount' | 'display_currency'>,
  ): number {
    return Math.round(Number(order.total || 0) + Number(order.tip_amount || 0));
  }

  async function fetchOrder(orderId: string, tenantId: string): Promise<PaymentOrderRow> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new ServiceError('Erreur lors du chargement de la commande', 'INTERNAL', error);
    }
    if (!data) {
      throw new ServiceError('Commande introuvable', 'NOT_FOUND');
    }
    return data as PaymentOrderRow;
  }

  async function fetchTenders(orderId: string, tenantId: string): Promise<PaymentTender[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('id, amount, method, status, created_by, created_at')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ServiceError('Erreur lors du chargement des paiements', 'INTERNAL', error);
    }

    return (data ?? []).map((row) => {
      const r = row as {
        id: string;
        amount: number | string;
        method: string;
        status: string;
        created_by: string | null;
        created_at: string;
      };
      return {
        id: r.id,
        amount: Number(r.amount || 0),
        method: r.method,
        status: r.status === 'refunded' ? 'refunded' : 'completed',
        createdBy: r.created_by,
        createdAt: r.created_at,
      };
    });
  }

  function summarize(order: PaymentOrderRow, tenders: PaymentTender[]): PaymentSummary {
    const completed = tenders
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    const refunded = tenders
      .filter((t) => t.status === 'refunded')
      .reduce((sum, t) => sum + t.amount, 0);
    const net = completed - refunded;
    const due = dueFor(order);

    return {
      orderId: order.id,
      due,
      completed,
      refunded,
      net,
      paymentStatus: deriveStatus(net, refunded, due),
      tenders,
    };
  }

  /**
   * Derive payment_status from the ledger:
   *   net <= 0 && refunded > 0 -> 'refunded'  (money came in then was given back)
   *   net <= 0                 -> 'pending'    (nothing settled yet)
   *   net < due                -> 'partial'    (some settled, balance remaining)
   *   else                     -> 'paid'       (fully settled)
   * All inputs are integer minor units, so the comparison is exact - no rounding
   * needed (integer minor amounts cannot carry sub-unit float drift).
   */
  function deriveStatus(net: number, refunded: number, due: number): PaymentStatus {
    if (net <= 0 && refunded > 0) return 'refunded';
    if (net <= 0) return 'pending';
    if (net < due) return 'partial';
    return 'paid';
  }

  /**
   * Recompute and persist payment_status from the ledger after a tender write.
   * When the order becomes 'paid' (and was not already paid) it also stamps
   * paid_at (if null) and sets status='delivered' - mirroring markPaid's
   * deliberate Phase-3 interim coupling of payment to fulfillment, and closes a
   * fully-settled table session (best-effort). Tenant-scoped.
   */
  async function recompute(order: PaymentOrderRow, tenantId: string): Promise<void> {
    const tenders = await fetchTenders(order.id, tenantId);
    const completed = tenders
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    const refunded = tenders
      .filter((t) => t.status === 'refunded')
      .reduce((sum, t) => sum + t.amount, 0);
    const net = completed - refunded;
    const due = dueFor(order);
    const newStatus = deriveStatus(net, refunded, due);

    const becomesPaid = newStatus === 'paid' && order.payment_status !== 'paid';

    const update: Record<string, unknown> = { payment_status: newStatus };
    if (becomesPaid) {
      if (!order.paid_at) update.paid_at = new Date().toISOString();
      update.status = 'delivered';
    }

    const { error } = await supabase
      .from('orders')
      .update(update)
      .eq('id', order.id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new ServiceError('Erreur lors de la mise a jour du paiement', 'INTERNAL', error);
    }

    if (newStatus === 'paid' && order.session_id) {
      // Best-effort: closing the table session must not fail the payment.
      try {
        await createOrderService(supabase).closeSessionIfFullySettled(order.session_id, tenantId);
      } catch (err) {
        logger.error('Failed to close table session after settlement', {
          orderId: order.id,
          tenantId,
          err,
        });
      }
    }
  }

  return {
    dueFor,

    /**
     * Aggregated payment state for an order, derived from the ledger.
     * Tenant-scoped. Throws NOT_FOUND if the order does not exist.
     */
    async getSummary(orderId: string, tenantId: string): Promise<PaymentSummary> {
      const order = await fetchOrder(orderId, tenantId);
      const tenders = await fetchTenders(orderId, tenantId);
      return summarize(order, tenders);
    },

    /**
     * Record one tender against an order. Multiple calls accumulate, so this is
     * the split / partial entry point: call it once per tender. The order's
     * payment_status is recomputed from the ledger afterwards. Tenant-scoped.
     */
    async recordTender(
      orderId: string,
      tenantId: string,
      { amount, method, createdBy }: TenderInput,
    ): Promise<PaymentSummary> {
      if (amount <= 0) {
        throw new ServiceError('Le montant doit etre superieur a zero', 'VALIDATION');
      }

      const order = await fetchOrder(orderId, tenantId);
      if (order.status === 'cancelled') {
        throw new ServiceError('Impossible d encaisser une commande annulee', 'CONFLICT');
      }

      const { error } = await supabase.from('payments').insert({
        tenant_id: tenantId,
        order_id: orderId,
        amount,
        method,
        status: 'completed',
        created_by: createdBy ?? null,
      });

      if (error) {
        throw new ServiceError('Erreur lors de l enregistrement du paiement', 'INTERNAL', error);
      }

      await recompute(order, tenantId);
      return this.getSummary(orderId, tenantId);
    },

    /**
     * Refund part or all of the net settled amount. Inserts an offsetting
     * 'refunded' row (positive amount) - the ledger is append-only, settled rows
     * are never mutated. Cannot refund more than the current net. Tenant-scoped.
     */
    async refund(
      orderId: string,
      tenantId: string,
      { amount, method, createdBy }: TenderInput,
    ): Promise<PaymentSummary> {
      if (amount <= 0) {
        throw new ServiceError('Le montant doit etre superieur a zero', 'VALIDATION');
      }

      const order = await fetchOrder(orderId, tenantId);
      const tenders = await fetchTenders(orderId, tenantId);
      const summary = summarize(order, tenders);

      if (amount > summary.net) {
        throw new ServiceError(
          'Le montant du remboursement depasse le montant encaisse',
          'VALIDATION',
        );
      }

      const { error } = await supabase.from('payments').insert({
        tenant_id: tenantId,
        order_id: orderId,
        amount,
        method,
        status: 'refunded',
        created_by: createdBy ?? null,
      });

      if (error) {
        throw new ServiceError('Erreur lors du remboursement', 'INTERNAL', error);
      }

      await recompute(order, tenantId);
      return this.getSummary(orderId, tenantId);
    },
  };
}
