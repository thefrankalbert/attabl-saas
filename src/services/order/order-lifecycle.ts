import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '../errors';
import { logger } from '@/lib/logger';

/**
 * Forward-only rank of the kitchen/fulfillment axis of order.status (audit H13).
 * A status may only advance to a higher rank; 'cancelled' is reachable from any
 * non-terminal state. Prevents a stale concurrent write from reverting a 'ready'
 * order back to 'preparing'.
 */
const ORDER_STATUS_RANK: Record<string, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
};

export function createLifecycleMethods(supabase: SupabaseClient) {
  /**
   * Close a table session once none of its orders are still awaiting payment
   * (every order paid or cancelled). Tenant-scoped. Best-effort: a failure here
   * must not fail the payment, so it only logs.
   */
  async function closeSessionIfFullySettled(sessionId: string, tenantId: string): Promise<void> {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .eq('payment_status', 'pending')
      .neq('status', 'cancelled');

    if (error) {
      logger.error('Failed to check session settlement', { sessionId, tenantId, error });
      return;
    }
    if ((count ?? 0) > 0) return; // still has unpaid orders -> keep open

    const { error: closeError } = await supabase
      .from('table_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    if (closeError) {
      logger.error('Failed to close table session', { sessionId, tenantId, error: closeError });
    }
  }

  return {
    /**
     * Public wrapper so non-markPaid settle paths (the POS route's
     * applyPosFinalState) can also close a fully-settled table session (audit C1).
     */
    closeSessionIfFullySettled,

    /**
     * Advance an order's status with a forward-only state machine + optimistic
     * concurrency (audit H13). Rejects backward transitions and races: a stale
     * KDS write can no longer revert a 'ready' order to 'preparing'. Cancellation
     * goes through cancelOrder (this still permits ->cancelled defensively).
     * Always tenant-scoped. markPaid/cancelOrder set their states directly and do
     * not go through here.
     */
    async updateStatus(orderId: string, tenantId: string, status: string): Promise<void> {
      const { data: current, error: fetchError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (fetchError) {
        throw new ServiceError('Erreur lors du chargement du statut', 'INTERNAL', fetchError);
      }
      if (!current) {
        throw new ServiceError('Commande introuvable', 'NOT_FOUND');
      }

      const from = current.status as string;
      if (from === status) return; // idempotent no-op

      if (from === 'delivered' || from === 'cancelled') {
        throw new ServiceError('Cette commande est finalisee', 'CONFLICT');
      }

      const rankFrom = ORDER_STATUS_RANK[from] ?? -1;
      const rankTo = ORDER_STATUS_RANK[status] ?? -1;
      if (status !== 'cancelled' && rankTo <= rankFrom) {
        throw new ServiceError('Transition de statut invalide', 'VALIDATION');
      }

      // C3: stamp served_at when the order reaches the terminal fulfillment state.
      const fulfillmentUpdate: Record<string, unknown> = { status };
      if (status === 'delivered') {
        fulfillmentUpdate.served_at = new Date().toISOString();
      }

      // Optimistic concurrency: only apply if the status is still what we read.
      const { data, error } = await supabase
        .from('orders')
        .update(fulfillmentUpdate)
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .eq('status', from)
        .select('id');

      if (error) {
        throw new ServiceError('Erreur lors de la mise a jour du statut', 'INTERNAL', error);
      }
      if (!Array.isArray(data) || data.length === 0) {
        // Another device advanced this order between our read and write.
        throw new ServiceError('La commande a deja ete mise a jour', 'CONFLICT');
      }
    },

    /**
     * Hold or fire a whole course of an order (KDS coursing). Held items are not
     * sent to the kitchen; firing sets held=false and stamps fired_at. Tenant-
     * scoped directly via order_items.tenant_id.
     */
    async setCourseHeld(
      orderId: string,
      tenantId: string,
      course: string,
      held: boolean,
    ): Promise<void> {
      const update: Record<string, unknown> = held
        ? { held: true }
        : { held: false, fired_at: new Date().toISOString() };

      const { error } = await supabase
        .from('order_items')
        .update(update)
        .eq('order_id', orderId)
        .eq('tenant_id', tenantId)
        .eq('course', course);

      if (error) {
        throw new ServiceError('Erreur lors du fire/hold du course', 'INTERNAL', error);
      }
    },

    /**
     * Cancel an order AND reverse its side-effects (audit finding C7): restore
     * the ingredients that were destocked and release any single-use coupon it
     * consumed. Before this, cancelling only flipped status='cancelled' and left
     * stock deducted + the coupon burnt.
     *
     * Idempotent: re-cancelling an already-cancelled order is a no-op. A PAID
     * order cannot be plain-cancelled here - that requires a refund (Phase 4) so
     * the financial record is preserved; we throw CONFLICT instead of silently
     * reversing money. restock/unclaim are themselves idempotent, so a partial
     * failure can be safely retried.
     */
    async cancelOrder(orderId: string, tenantId: string): Promise<void> {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('id, status, payment_status, coupon_id')
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (fetchError) {
        throw new ServiceError('Erreur lors du chargement de la commande', 'INTERNAL', fetchError);
      }
      if (!order) {
        throw new ServiceError('Commande introuvable', 'NOT_FOUND');
      }
      if (order.status === 'cancelled') {
        return; // already cancelled - no-op
      }
      if (order.payment_status === 'paid') {
        throw new ServiceError(
          'Une commande payee ne peut pas etre annulee - utiliser un remboursement',
          'CONFLICT',
        );
      }

      // Release the coupon (idempotent). NOTE: ingredient restock is handled by the
      // caller via the canonical service_role restock_order path (main's
      // stock-integrity feature) - restock_order is service_role-only, so it cannot
      // be called from this authenticated service client. See actionUpdateOrderStatus.
      if (order.coupon_id) {
        const { error: unclaimError } = await supabase.rpc('unclaim_coupon_usage', {
          p_coupon_id: order.coupon_id,
        });
        if (unclaimError) {
          throw new ServiceError(
            'Erreur lors de la liberation du coupon',
            'INTERNAL',
            unclaimError,
          );
        }
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
      if (updateError) {
        throw new ServiceError("Erreur lors de l'annulation", 'INTERNAL', updateError);
      }
    },

    /**
     * Mark an order as paid - updates payment_method, payment_status, paid_at,
     * and optionally tip_amount. Always filters by tenant_id for isolation.
     *
     * C3 (Phase 3): payment is DECOUPLED from fulfillment. markPaid no longer
     * touches orders.status - the fulfillment axis is driven solely by the KDS/POS
     * fulfillment actions (updateStatus / applyPosFinalState). This makes "paid but
     * not yet served" and "served but unpaid" representable, and keeps a paid-but-
     * unprepared order on the KDS active board (which filters on status, not
     * payment) instead of wrongly dropping it.
     *
     * Idempotent: the update is scoped to payment_status='pending' (same guard as
     * the POS route applyPosFinalState). A double-tap / network retry on an
     * already-paid order matches 0 rows and is a no-op - it never re-stamps
     * paid_at nor overwrites the recorded tip. Returns whether the order was
     * actually flipped from pending to paid by this call.
     */
    async markPaid(
      orderId: string,
      tenantId: string,
      payload: { method: string; tipAmount?: number },
    ): Promise<{ paid: boolean }> {
      // payload.tipAmount is in integer MINOR units (orders.tip_amount is BIGINT
      // minor). The caller (PaymentModal -> actionMarkOrderPaid) converts the
      // major keypad amount with the order currency before sending.
      const update: Record<string, unknown> = {
        payment_method: payload.method,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
      };
      if (payload.tipAmount && payload.tipAmount > 0) {
        update.tip_amount = payload.tipAmount;
      }

      const { data, error } = await supabase
        .from('orders')
        .update(update)
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'pending')
        .select('id, session_id, total, tip_amount');

      if (error) {
        throw new ServiceError('Erreur lors du paiement', 'INTERNAL', error);
      }

      const paidRow = Array.isArray(data) && data.length > 0 ? data[0] : null;

      if (paidRow) {
        // Append the tender to the ledger (audit H2/H8): who/what/when, append-only.
        // Best-effort - payment_status is already flipped; a ledger failure must not
        // un-settle the order. The amount tendered = order total (excl. tip) + tip.
        const amount = Number(paidRow.total || 0) + Number(paidRow.tip_amount || 0);
        const { error: tenderError } = await supabase.from('payments').insert({
          tenant_id: tenantId,
          order_id: orderId,
          amount,
          method: payload.method,
          status: 'completed',
        });
        if (tenderError) {
          logger.error('Failed to record payment tender', {
            orderId,
            tenantId,
            error: tenderError,
          });
        }

        // Close the table session once every order on it is settled (audit C1).
        // Leaving it open would let tomorrow's orders attach to today's check.
        if (paidRow.session_id) {
          await closeSessionIfFullySettled(paidRow.session_id as string, tenantId);
        }
      }

      return { paid: paidRow !== null };
    },
  };
}
