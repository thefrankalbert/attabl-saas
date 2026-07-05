import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { createOrderService } from './order.service';
import type { CompInput, CompResult, PaymentSummary, TenderInput } from './payment.types';
import { dueFor, summarize } from './payment.calc';
import { fetchOrder, fetchTenders, recompute } from './payment.queries';

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

// Re-export the public types so callers keep importing them from this module.
export type { PaymentTender, PaymentSummary, CompResult } from './payment.types';

export function createPaymentService(supabase: SupabaseClient) {
  return {
    dueFor,

    /**
     * Aggregated payment state for an order, derived from the ledger.
     * Tenant-scoped. Throws NOT_FOUND if the order does not exist.
     */
    async getSummary(orderId: string, tenantId: string): Promise<PaymentSummary> {
      const order = await fetchOrder(supabase, orderId, tenantId);
      const tenders = await fetchTenders(supabase, orderId, tenantId);
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

      const order = await fetchOrder(supabase, orderId, tenantId);
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

      await recompute(supabase, order, tenantId);
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

      const order = await fetchOrder(supabase, orderId, tenantId);
      const tenders = await fetchTenders(supabase, orderId, tenantId);
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

      await recompute(supabase, order, tenantId);
      return this.getSummary(orderId, tenantId);
    },

    /**
     * Comp / offer an order: close it for FREE (no tender). This is a MANAGER
     * privilege (fraud surface) - the action layer gates it to owner/admin/manager.
     *
     * Comp is COLUMNS-ONLY on orders (payment_status='comp', is_comp, comp_reason,
     * comped_by, comped_at, comp_amount). It is NEVER written to the payments
     * ledger: summarize() maps any non-'refunded' tender row to 'completed', so a
     * comp ledger row would inflate net revenue. Because payment_status becomes
     * 'comp' (not 'paid'), the order is auto-excluded from get_daily_revenue /
     * get_order_summary / get_top_items (all filter payment_status='paid') and
     * surfaces only in get_daily_comps.
     *
     * Destock already ran at order creation - a comped order still consumed its
     * ingredients, so this does NOT touch stock (order.service is never called for
     * comp). Tenant-scoped, optimistic (only a 'pending' order can be comped).
     */
    async compOrder(
      orderId: string,
      tenantId: string,
      { reason, compedBy }: CompInput,
    ): Promise<CompResult> {
      const order = await fetchOrder(supabase, orderId, tenantId);

      if (order.status === 'cancelled') {
        throw new ServiceError('Impossible d offrir une commande annulee', 'CONFLICT');
      }
      if (order.payment_status === 'paid') {
        throw new ServiceError(
          'Cette commande est deja payee. Utilisez un remboursement.',
          'CONFLICT',
        );
      }
      if (order.payment_status === 'comp') {
        // Idempotent replay: already offered. No second write, no second audit
        // side-effect (the action reads `comped` to decide whether to log).
        return { summary: await this.getSummary(orderId, tenantId), comped: false };
      }

      // comp_amount snapshots the value offered (total + tip) at comp time.
      const compAmount = dueFor(order);

      const { data: updated, error } = await supabase
        .from('orders')
        .update({
          payment_status: 'comp',
          is_comp: true,
          comp_reason: reason,
          comped_by: compedBy ?? null,
          comped_at: new Date().toISOString(),
          comp_amount: compAmount,
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'pending')
        .select('id');

      if (error) {
        throw new ServiceError('Erreur lors de l offre de la commande', 'INTERNAL', error);
      }
      if (!updated || updated.length === 0) {
        // Not 'pending' at write time (partial/refunded, or a concurrent change):
        // a partially-settled order must be refunded before it can be offered.
        throw new ServiceError(
          'Impossible d offrir une commande deja encaissee en partie',
          'CONFLICT',
        );
      }

      if (order.session_id) {
        // Best-effort: closing the table session must not fail the comp.
        try {
          await createOrderService(supabase).closeSessionIfFullySettled(order.session_id, tenantId);
        } catch (err) {
          logger.error('Failed to close table session after comp', { orderId, tenantId, err });
        }
      }

      return { summary: await this.getSummary(orderId, tenantId), comped: true };
    },
  };
}
