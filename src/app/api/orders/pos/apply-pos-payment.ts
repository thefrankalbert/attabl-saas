import type { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { createOrderService } from '@/services/order.service';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * - 'paid': the money is booked (now, or by an earlier attempt).
 * - 'not_payable': the order cannot be paid (cancelled): nothing to retry.
 * - 'failed': the payment could not be booked (DB or ledger error): retryable,
 *   the route answers 503 so an outbox replay keeps the sale and tries again.
 */
export type PosPaymentOutcome = 'paid' | 'not_payable' | 'failed';

/**
 * Records a cash-desk payment on an order that already exists, and says how it
 * ended, so the route can tell the cashier the truth instead of always
 * answering "sale recorded".
 *
 * Idempotent: the flip is scoped to payment_status='pending', so a replay (or an
 * order already paid) matches no row and never re-stamps paid_at; it then reads
 * the current state and reports it. A cancelled order keeps payment_status
 * 'pending', hence `.neq('status','cancelled')` in the same UPDATE (atomic
 * against a concurrent cancellation).
 *
 * The ledger row is what revenue is read from. If it cannot be written, the flip
 * is UNDONE: a 'paid' order without its row would be missing from the takings
 * for good, because the guarded flip can never run again (audit caisse
 * 2026-11-15). The order then shows again in "A encaisser".
 *
 * Fulfillment is not touched: every POS order goes to the kitchen ('pending').
 */
export async function applyPosPayment(
  supabase: AdminClient,
  orderId: string,
  tenantId: string,
  paymentMethod: string,
): Promise<PosPaymentOutcome> {
  const paidAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({
      payment_method: paymentMethod,
      payment_status: 'paid',
      paid_at: paidAt,
    })
    .eq('id', orderId)
    // Service-role client bypasses RLS: scope to the tenant explicitly.
    .eq('tenant_id', tenantId)
    .eq('payment_status', 'pending')
    .neq('status', 'cancelled')
    .select('id, total, tip_amount, session_id');

  if (error) {
    logger.error('POS order: failed to apply payment', error, { orderId });
    return 'failed';
  }

  const flipped = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!flipped) {
    // Nothing flipped: already paid by an earlier attempt (replay), or not
    // payable (cancelled). Report the real state.
    const { data: current, error: readError } = await supabase
      .from('orders')
      .select('payment_status, status')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (readError || !current) return 'failed';
    if (current.payment_status === 'paid') return 'paid';
    // Still unpaid and not cancelled: the flip itself did not land, retry.
    // Anything else (cancelled, partly paid, offered, refunded) is settled
    // elsewhere: retrying would only burn the outbox attempts.
    return current.payment_status === 'pending' && current.status !== 'cancelled'
      ? 'failed'
      : 'not_payable';
  }

  // amount = total (excl. tip) + tip, both in minor units.
  const amount = Number(flipped.total || 0) + Number(flipped.tip_amount || 0);
  const { error: tenderError } = await supabase.from('payments').insert({
    tenant_id: tenantId,
    order_id: orderId,
    amount,
    method: paymentMethod,
    status: 'completed',
  });

  const orderService = createOrderService(supabase);
  if (tenderError) {
    logger.error('POS order: payment tender not recorded, payment undone', tenderError, {
      orderId,
    });
    await orderService.revertPaidFlip(orderId, tenantId, paidAt);
    return 'failed';
  }

  // Close the table session once fully settled (audit C1): paid AND served.
  const sessionId = (flipped as { session_id?: string | null }).session_id;
  if (sessionId) {
    await orderService.closeSessionIfFullySettled(sessionId, tenantId);
  }
  return 'paid';
}
