import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { createOrderService } from './order.service';
import { ORDER_COLUMNS, type PaymentOrderRow, type PaymentTender } from './payment.types';
import { deriveStatus, dueFor } from './payment.calc';

/**
 * Ledger I/O for the payment service: tenant-scoped reads of the order and its
 * tenders, plus the recompute-and-persist step. Extracted from
 * payment.service.ts so the factory stays the orchestrator. Every query is
 * tenant-scoped.
 */

export async function fetchOrder(
  supabase: SupabaseClient,
  orderId: string,
  tenantId: string,
): Promise<PaymentOrderRow> {
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

export async function fetchTenders(
  supabase: SupabaseClient,
  orderId: string,
  tenantId: string,
): Promise<PaymentTender[]> {
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

/**
 * Recompute and persist payment_status from the ledger after a tender write.
 * When the order becomes 'paid' (and was not already paid) it also stamps
 * paid_at (if null) and closes a fully-settled table session (best-effort).
 * Tenant-scoped.
 *
 * C3 (Phase 3): payment is DECOUPLED from fulfillment - this no longer touches
 * orders.status. Fulfillment is driven solely by the KDS/POS actions.
 */
export async function recompute(
  supabase: SupabaseClient,
  order: PaymentOrderRow,
  tenantId: string,
): Promise<void> {
  const tenders = await fetchTenders(supabase, order.id, tenantId);
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
  if (becomesPaid && !order.paid_at) {
    update.paid_at = new Date().toISOString();
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
