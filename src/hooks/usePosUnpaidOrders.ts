'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { logger } from '@/lib/logger';
import type { Order, ItemStatus } from '@/types/admin.types';

/**
 * Loads the tenant's orders that still need to be settled at the cash desk:
 * payment_status='pending' and not cancelled (any fulfillment state - a QR order
 * served to a table is exactly what the cashier must be able to bill). This is
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
        .eq('payment_status', 'pending')
        .neq('status', 'cancelled')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const mapped = (data || []).map(
        (row: Record<string, unknown> & { order_items?: Array<Record<string, unknown>> }) => ({
          ...row,
          // PaymentModal reads order.total_price (mapped from the DB `total` column).
          total_price: Number(row.total || 0),
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
        }),
      );

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
