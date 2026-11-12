'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { logger } from '@/lib/logger';
import { dueFor } from '@/services/payment.calc';
import type { Order, ItemStatus } from '@/types/admin.types';

/**
 * Solde restant d'une commande, en unites MINEURES: ce qui est du (total +
 * pourboire) moins ce qui est deja entre au registre, remboursements deduits.
 * Jamais negatif. Isole pour etre teste: c'est de l'argent reclame a un client.
 */
export function remainingDueMinor(
  order: { total?: number | null; tip_amount?: number | null },
  tenders: ReadonlyArray<{ amount: number; status: string }>,
): number {
  const net = tenders.reduce((somme, t) => {
    if (t.status === 'completed') return somme + Number(t.amount || 0);
    if (t.status === 'refunded') return somme - Number(t.amount || 0);
    return somme;
  }, 0);
  const due = dueFor({
    total: Number(order.total || 0),
    tip_amount: Number(order.tip_amount || 0),
    display_currency: null,
  });
  return Math.max(0, due - net);
}

/**
 * Loads the tenant's orders that still need to be settled at the cash desk:
 * payment_status 'pending' OR 'partial', and not cancelled (any fulfillment
 * state - a QR order served to a table is exactly what the cashier must be able
 * to bill). A partly paid check still has money to collect: filtering on
 * 'pending' alone made it vanish from the panel as soon as a deposit was
 * recorded (audit 2026-11-10, C-042). Partial orders carry `amount_due`, the
 * balance left according to the payments ledger. This is
 * the data behind the POS "A encaisser" panel (audit finding C2): before this,
 * the caisse could only create brand-new sales and never pull up an existing QR
 * order to bill it, forcing a duplicate order.
 *
 * Realtime: any change to the tenant's orders reloads the list so a freshly
 * placed QR order appears, and a just-settled order disappears, without a manual
 * refresh. RLS scopes the browser client to the caller's tenant.
 */
export function usePosUnpaidOrders(tenantId: string) {
  const [supabase] = useState(() => createClient());
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Cash-desk scope: only orders from the last 7 days, capped at 100. An
      // unpaid order older than that is a bookkeeping problem, not something
      // the cashier settles from the register - unbounded history made the
      // panel unusable (90+ stale test orders) and the query ever-growing.
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .in('payment_status', ['pending', 'partial'])
        .neq('status', 'cancelled')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      // Solde des notes payees en partie: lu au registre, jamais devine.
      const partialIds = (data || [])
        .filter((row: { payment_status?: string | null }) => row.payment_status === 'partial')
        .map((row: { id: string }) => row.id);
      const tendersByOrder = new Map<string, Array<{ amount: number; status: string }>>();
      if (partialIds.length > 0) {
        const { data: tenders, error: tendersError } = await supabase
          .from('payments')
          .select('order_id, amount, status')
          .eq('tenant_id', tenantId)
          .in('order_id', partialIds);
        if (tendersError) throw tendersError;
        for (const t of tenders || []) {
          const liste = tendersByOrder.get(t.order_id as string) ?? [];
          liste.push({ amount: Number(t.amount || 0), status: String(t.status) });
          tendersByOrder.set(t.order_id as string, liste);
        }
      }

      // Un remboursement rend aussi une commande 'partial', mais c'est de
      // l'argent RENDU volontairement, pas un solde a reclamer: la proposer a
      // l'encaissement ferait repayer au client ce qu'on vient de lui rendre.
      const refundedIds = new Set(
        [...tendersByOrder.entries()]
          .filter(([, liste]) => liste.some((t) => t.status === 'refunded'))
          .map(([orderId]) => orderId),
      );

      const mapped = (data || [])
        .filter((row: { id: string }) => !refundedIds.has(row.id))
        .map((row: Record<string, unknown> & { order_items?: Array<Record<string, unknown>> }) => ({
          ...row,
          // PaymentModal reads order.total_price (mapped from the DB `total` column).
          total_price: Number(row.total || 0),
          amount_due:
            row.payment_status === 'partial'
              ? remainingDueMinor(
                  row as { total?: number | null; tip_amount?: number | null },
                  tendersByOrder.get(row.id as string) ?? [],
                )
              : undefined,
          items: (row.order_items || []).map((oi) => ({
            id: oi.id as string,
            name: (oi.item_name as string) || '',
            quantity: (oi.quantity as number) || 1,
            price: (oi.price_at_order as number) || 0,
            menu_item_id: oi.menu_item_id as string | undefined,
            notes: oi.notes as string | undefined,
            customer_notes: oi.customer_notes as string | undefined,
            item_status: (oi.item_status as ItemStatus) || 'pending',
            modifiers: oi.modifiers as Array<{ name: string; price: number }> | undefined,
          })),
        }));

      setUnpaidOrders(mapped as Order[]);
    } catch (error) {
      logger.error('POS unpaid orders loading error', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `pos_unpaid_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onChange: () => {
      load();
    },
  });

  return { unpaidOrders, loading, refresh: load };
}
