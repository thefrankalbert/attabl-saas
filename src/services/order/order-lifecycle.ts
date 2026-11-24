import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '../errors';
import { logger } from '@/lib/logger';
import { toMinorUnits } from '@/lib/utils/money';
import { MAX_TIP_AMOUNT } from '@/lib/validations/order.schema';

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

/**
 * A paid order still not marked served after this delay is treated as served:
 * many floors never tap "servi", and the table must not stay "occupied" for
 * good (owner decision 2026-11-15: follow the market's usage - occupied while
 * the order is in progress, with a manual release and this automatic one).
 */
// Same value hard-coded for non-server callers in close_table_session_if_settled
// (migration 20261115200000): change both together.
export const STALE_PAID_ORDER_MS = 2 * 60 * 60 * 1000;

/**
 * Marqueur (ServiceError.details.reason) d'une annulation refusee parce que de
 * l'argent reste au registre et que la personne n'a pas l'autorite sur l'argent
 * (owner, admin, manager). L'action le traduit au lieu de montrer le texte brut.
 */
export const CANCEL_NEEDS_MONEY_AUTHORITY = 'cancel_needs_money_authority';

export function createLifecycleMethods(supabase: SupabaseClient) {
  /**
   * Close a table session once everything on it is settled: paid (a 'partial'
   * bill still owes money) AND served - since #416 a sale paid at the till is
   * still cooking - unless the order is older than STALE_PAID_ORDER_MS (paid
   * but never marked served: owner decision 2026-11-15, market usage).
   *
   * The check and the close run in ONE database function that takes the same
   * table lock as create_order_with_items (migration 20261115200000): before,
   * an order placed between the count and the close landed on a closed
   * session. Tenant-scoped. Best-effort: a failure here must not fail the
   * payment or the kitchen gesture, so it only logs.
   */
  async function closeSessionIfFullySettled(sessionId: string, tenantId: string): Promise<void> {
    const { error } = await supabase.rpc('close_table_session_if_settled', {
      p_session_id: sessionId,
      p_tenant_id: tenantId,
      p_stale_before: new Date(Date.now() - STALE_PAID_ORDER_MS).toISOString(),
    });
    if (error) {
      logger.error('Failed to close table session', { sessionId, tenantId, error });
    }
  }

  /**
   * Undo a payment flip whose ledger row could not be written: back to unpaid,
   * so the order shows again in "A encaisser" instead of being 'paid' with no
   * money in the takings. Scoped to the `paid_at` THIS flip wrote, so it never
   * undoes a concurrent settlement that did book its money. Only the POS
   * route uses it, with the service role (the guard trigger lets that role
   * through); markPaid no longer needs it, its flip and ledger row share one
   * transaction. A revert that fails or matches nothing leaves a paid order
   * without its ledger row: logged as an error to be fixed by hand.
   */
  async function revertPaidFlip(orderId: string, tenantId: string, paidAt: string): Promise<void> {
    const { data, error } = await supabase
      .from('orders')
      .update({
        payment_status: 'pending',
        payment_method: null,
        paid_at: null,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .eq('paid_at', paidAt)
      .select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      logger.error('Payment undo failed: order paid WITHOUT ledger row', {
        orderId,
        tenantId,
        error,
      });
    }
  }

  /**
   * "Liberer la table" (Service screen): closes the table's open session when
   * nothing on it is still owed, served or not - the staff knows the guests
   * left. Refused while money is due: closing would hide an unpaid bill.
   */
  async function releaseTableSession(
    tenantId: string,
    tableNumber: string,
    displayName?: string,
  ): Promise<void> {
    // The floor shows a table occupied when a session matches its number OR its
    // display name (older sessions): look both up, or the button would say
    // "freed" while the table stays occupied.
    const keys = [...new Set([tableNumber, displayName].filter((k): k is string => !!k))];
    const { data: sessions, error } = await supabase
      .from('table_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('table_number', keys)
      .eq('status', 'open');
    if (error) throw new ServiceError('Erreur de lecture de la table', 'INTERNAL', error);
    const session = (sessions ?? [])[0] as { id: string } | undefined;
    if (!session) throw new ServiceError('Cette table est deja libre', 'NOT_FOUND');

    // Locked check-and-close in the database: only money due counts here (the
    // staff knows the guests left), and only the service role may ask for that.
    const { data: outcome, error: closeError } = await supabase.rpc(
      'close_table_session_if_settled',
      { p_session_id: session.id, p_tenant_id: tenantId, p_require_served: false },
    );
    if (closeError) {
      throw new ServiceError('Erreur de liberation de la table', 'INTERNAL', closeError);
    }
    if (outcome === 'unsettled') {
      throw new ServiceError(
        "Il reste de l'argent du sur cette table: encaissez-la avant de la liberer",
        'CONFLICT',
      );
    }
    if (outcome !== 'closed') {
      throw new ServiceError('Cette table est deja libre', 'NOT_FOUND');
    }
  }

  /**
   * Automatic release: re-checks every table open for longer than the delay,
   * so a paid table whose order was never marked served frees itself. Run on
   * the screens that show occupancy and before an order is placed. Bounded by
   * the open sessions of ONE tenant.
   */
  async function releaseStaleSessions(tenantId: string, tableNumber?: string): Promise<void> {
    let query = supabase
      .from('table_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'open');
    // An order only needs ITS table checked, not every table of the restaurant.
    if (tableNumber) query = query.eq('table_number', tableNumber);
    const { data, error } = await query.lt(
      'opened_at',
      new Date(Date.now() - STALE_PAID_ORDER_MS).toISOString(),
    );
    if (error) {
      logger.error('Failed to list stale table sessions', { tenantId, error });
      return;
    }
    for (const row of (data ?? []) as Array<{ id: string }>) {
      await closeSessionIfFullySettled(row.id, tenantId);
    }
  }

  return {
    releaseTableSession,
    releaseStaleSessions,

    /** Undo a paid flip whose ledger insert failed (also used by the POS route). */
    revertPaidFlip,

    /**
     * Public wrapper so non-markPaid settle paths (the POS route's
     * applyPosPayment) can also close a fully-settled table session (audit C1).
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
    /** Returns false when the order already had this status (no-op), true on a real change. */
    async updateStatus(orderId: string, tenantId: string, status: string): Promise<boolean> {
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
      if (from === status) return false; // idempotent no-op

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
        // Zero ligne touchee a DEUX causes possibles, et les confondre produit
        // un message faux. Soit un autre poste a fait avancer la commande
        // entre notre lecture et notre ecriture (conflit reel), soit la RLS a
        // masque la ligne parce que l'employe n'a pas le droit d'ecrire - et la
        // RLS ne leve AUCUNE erreur dans ce cas, elle masque. On distingue en
        // relisant: si le statut n'a pas bouge, personne n'a double, c'est un
        // refus. La lecture reste permise a tout membre du restaurant, donc ce
        // diagnostic fonctionne pour celui-la meme qui vient d'etre refuse.
        const { data: apres } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (apres && (apres.status as string) === from) {
          throw new ServiceError(
            'Vous n avez pas la permission de modifier cette commande',
            'UNAUTHORIZED',
          );
        }
        throw new ServiceError('La commande a deja ete mise a jour', 'CONFLICT');
      }
      return true;
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
     *
     * Meme critere que la base (migration 20261124120000): c'est le NET du
     * registre `payments` (encaissements 'completed' moins remboursements
     * 'refunded' de la commande, filtre par tenant_id) qui juge, pas la colonne
     * `payment_status` qu'un caissier peut reecrire. Net couvrant le du: il faut
     * un remboursement d'abord. Net positif sous le du (acompte): decision sur
     * de l'argent encore en caisse, reservee a l'autorite sur l'argent (owner,
     * admin, manager). Sans elle on refuse ici avec un message clair, au lieu de
     * laisser la base repondre une erreur generique. La base reste l'arbitre
     * final.
     */
    async cancelOrder(
      orderId: string,
      tenantId: string,
      options: { canManageMoney?: boolean } = {},
    ): Promise<void> {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('id, status, payment_status, coupon_id, total, tip_amount')
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
      const refundFirst = () =>
        new ServiceError(
          'Une commande payee ne peut pas etre annulee - utiliser un remboursement',
          'CONFLICT',
        );
      if (order.payment_status === 'paid') {
        throw refundFirst();
      }

      const { data: ledger, error: ledgerError } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('order_id', orderId)
        .eq('tenant_id', tenantId);
      if (ledgerError) {
        throw new ServiceError('Erreur lors du chargement du registre', 'INTERNAL', ledgerError);
      }
      const net = ((ledger ?? []) as Array<{ amount: number | string; status: string }>).reduce(
        (sum, row) =>
          row.status === 'completed'
            ? sum + Number(row.amount)
            : row.status === 'refunded'
              ? sum - Number(row.amount)
              : sum,
        0,
      );
      const due = Number(order.total ?? 0) + Number(order.tip_amount ?? 0);
      if (net >= Math.max(due, 1)) {
        throw refundFirst();
      }
      if (net > 0 && !options.canManageMoney) {
        throw new ServiceError(
          "Cette commande a un acompte au registre : l'annuler revient a un gerant, un administrateur ou le proprietaire",
          'CONFLICT',
          { reason: CANCEL_NEEDS_MONEY_AUTHORITY },
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
     * Mark an order as paid - payment_method, payment_status, paid_at, the till
     * tip, and the ledger row, in one database transaction. Always scoped to
     * tenant_id for isolation.
     *
     * C3 (Phase 3): payment is DECOUPLED from fulfillment. markPaid no longer
     * touches orders.status - the fulfillment axis is driven solely by the KDS/POS
     * fulfillment action (updateStatus). This makes "paid but
     * not yet served" and "served but unpaid" representable, and keeps a paid-but-
     * unprepared order on the KDS active board (which filters on status, not
     * payment) instead of wrongly dropping it.
     *
     * Idempotent: the database call is scoped to payment_status='pending' (same
     * guard as the POS route applyPosPayment). A double-tap / network retry on
     * an already-paid order matches nothing and is a no-op - it never re-stamps
     * paid_at nor adds the till tip twice. Returns whether the order was
     * actually flipped from pending to paid by this call.
     */
    async markPaid(
      orderId: string,
      tenantId: string,
      payload: { method: string; tipAmount?: number },
    ): Promise<{ paid: boolean }> {
      // payload.tipAmount is in integer MINOR units (orders.tip_amount is BIGINT
      // minor). The caller (PaymentModal -> actionMarkOrderPaid) converts the
      // major keypad amount with the order currency before sending. It is the
      // tip ADDED at the till: the database adds it to the one the customer
      // left (audit pourboires 2026-11-20, constat B).
      const tipAdded = payload.tipAmount && payload.tipAmount > 0 ? payload.tipAmount : 0;
      if (tipAdded > 0) {
        const { data: before, error: beforeError } = await supabase
          .from('orders')
          .select('tip_amount, display_currency, payment_status')
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (beforeError) {
          // 'Erreur interne' is the sentinel /api/orders/mutations maps to 500:
          // a transient read failure must stay retryable in the offline outbox.
          throw new ServiceError('Erreur interne', 'INTERNAL', beforeError);
        }
        // Only a still-pending order gets a tip. An already-settled one (replay
        // of a payment that went through) skips the ceiling: the database call
        // below matches nothing and answers paid:false, instead of refusing a
        // replay whose first attempt already added the tip.
        if (before && before.payment_status === 'pending') {
          // Same ceiling as the order route (MAX_TIP_AMOUNT in MAJOR units of
          // the order currency), on the resulting tip (constat F). Checked here
          // for a clear message; the database enforces it again on the real
          // sum, with the same ceiling (migration 20261120220000).
          const ceiling = toMinorUnits(MAX_TIP_AMOUNT, before.display_currency as string | null);
          if (Number(before.tip_amount || 0) + tipAdded > ceiling) {
            throw new ServiceError('Pourboire trop eleve', 'VALIDATION');
          }
        }
      }

      // Flip AND ledger row in ONE transaction (migration 20261120220000). They
      // used to be two writes, and undoing the flip after a failed ledger row
      // could never work for a cashier: the guard trigger rewrites paid_at and
      // refuses paid -> pending without the money authority. A paid order was
      // left without its ledger row, missing from the takings for good. Now a
      // failed ledger row rolls the flip back by itself. SECURITY INVOKER: RLS
      // and every guard still apply to the caller. Same filters as before: this
      // tenant, still 'pending', not cancelled - a replay is a no-op.
      const { data, error } = await supabase.rpc('encaisser_commande', {
        p_order_id: orderId,
        p_tenant_id: tenantId,
        p_method: payload.method,
        p_tip_ajout: tipAdded,
      });

      if (error) {
        logger.error('Payment not recorded (flip and ledger rolled back together)', {
          orderId,
          tenantId,
          error,
        });
        // The database REFUSED: a definitive answer, never retried by the
        // offline outbox. 23514 is a check violation, raised by more than one
        // rule: the plan lock on the tip (PR #444, enforce_order_plan_features)
        // and the list of payment methods (orders_payment_method_check) - the
        // message tells them apart. 22023 / 42501 = guard, ceiling, rights.
        // Anything else is transient: 'Erreur interne' keeps it retryable, and
        // nothing was booked, so a retry cannot collect twice.
        const { code, message = '' } = error as { code?: string; message?: string };
        if (code === '23514' && message.includes('Tips require')) {
          throw new ServiceError('Pourboire non inclus dans votre plan', 'VALIDATION', error);
        }
        if (code === '23514' && message.includes('orders_payment_method_check')) {
          throw new ServiceError('Moyen de paiement non accepte', 'VALIDATION', error);
        }
        if (code === '23514' || code === '22023' || code === '42501') {
          throw new ServiceError("Le paiement n'a pas pu etre enregistre", 'VALIDATION', error);
        }
        throw new ServiceError('Erreur interne', 'INTERNAL', error);
      }

      const result = (data ?? {}) as {
        paid?: boolean;
        session_id?: string | null;
        payment_status?: string | null;
        status?: string | null;
      };

      // Nothing flipped: say why instead of "already settled" for everything.
      // A cancelled order keeps payment_status 'pending', and an order out of
      // reach (another restaurant, deleted) comes back without any state.
      if (!result.paid && result.status === 'cancelled') {
        throw new ServiceError(
          'Cette commande est annulee : elle ne peut pas etre encaissee.',
          'VALIDATION',
        );
      }
      if (!result.paid && !result.payment_status) {
        throw new ServiceError('Commande introuvable', 'NOT_FOUND');
      }

      // A partly paid order is settled tender by tender from its details
      // (OrderPaymentPanel): this screen would ask for the full amount. It used
      // to answer "success, already settled" - the cashier believed the money
      // was in.
      if (!result.paid && result.payment_status === 'partial') {
        throw new ServiceError(
          'Cette commande a deja recu un paiement partiel. Encaissez le reste depuis le detail de la commande.',
          'VALIDATION',
        );
      }

      // Close the table session once every order on it is settled (audit C1).
      // Leaving it open would let tomorrow's orders attach to today's check.
      if (result.paid && result.session_id) {
        await closeSessionIfFullySettled(result.session_id, tenantId);
      }

      return { paid: result.paid === true };
    },
  };
}
