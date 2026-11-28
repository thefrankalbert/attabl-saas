'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fromMinorUnits } from '@/lib/utils/money';
import { logger } from '@/lib/logger';
import { useCart } from '@/contexts/CartContext';
import { getCartItemKey } from '@/components/tenant/cart/CartItemsList';
import { remainingItemCapacity } from '@/lib/utils/cart-display';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { parseLineModifiers } from '@/lib/utils/order-line-display';
import { planReorder } from '@/lib/utils/reorder-lines';
import {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  getStoredOrderIds,
  type OrderRecord,
  type TrackedClientRow,
} from './types';

interface UseClientOrdersParams {
  tenantSlug: string;
  tenantId: string;
  currency: string;
  showHistory: boolean;
}

export function useClientOrders({
  tenantSlug,
  tenantId,
  currency,
  showHistory,
}: UseClientOrdersParams) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const t = useTranslations('tenant');
  const { toast } = useToast();
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const { notifyOrderReady, showReadyBanner, dismissBanner, readyOrderNumber } =
    useClientOrderNotification();

  const router = useRouter();
  const { addToCart, items } = useCart();

  // --- Load orders ------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseRef.current;
    const storedIds = getStoredOrderIds(tenantSlug);

    if (storedIds.length === 0) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    supabase
      .rpc('get_orders_for_tracking', { p_tenant_id: tenantId, p_order_ids: storedIds })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error('Failed to load orders', error);
        } else {
          // Order money columns are integer MINOR units; convert to major (order
          // base currency = the tenant currency prop) so formatDisplayPrice keeps
          // working. Identity for XAF.
          const toMajor = (minor: number) => fromMinorUnits(minor, currency);
          const mapped: OrderRecord[] = ((data as unknown as TrackedClientRow[]) || []).map(
            (row) => ({
              id: row.id,
              order_number: row.order_number,
              status: row.status,
              total: toMajor(row.total),
              tip_amount: toMajor(row.tip_amount ?? 0),
              table_number: row.table_number,
              created_at: row.created_at,
              service_type: row.service_type,
              items: (row.order_items || []).map((oi) => ({
                name: oi.item_name,
                name_en: oi.item_name_en ?? undefined,
                quantity: oi.quantity,
                price: toMajor(oi.price_at_order),
                menu_item_id: oi.menu_item_id ?? undefined,
                image_url: oi.image_url ?? null,
                modifiers: parseLineModifiers(oi.modifiers),
                notes: oi.customer_notes ?? null,
              })),
            }),
          );
          setOrders(mapped);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, tenantSlug, currency]);

  // --- Realtime: listen for status changes on ACTIVE orders only --

  const activeOrderIds = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.has(o.status)).map((o) => o.id),
    [orders],
  );
  // Stable dependency: only re-subscribe when the SET of active order ids changes,
  // not on every order object mutation (which gives activeOrderIds a new identity).
  const activeKey = activeOrderIds.join(',');

  useEffect(() => {
    if (activeOrderIds.length === 0) return;

    const supabase = supabaseRef.current;

    // Live status via Broadcast on PER-ORDER public topics (DB trigger
    // broadcast_order_status sends to order:<id>). Payload is non-PII ({ id, status }).
    // Subscribing per order (instead of a tenant-wide topic) means an anonymous
    // client only ever receives broadcasts for orders whose id it already holds -
    // no tenant-wide order-status stream is observable.
    const channels = activeOrderIds.map((orderId) =>
      supabase
        .channel(`order:${orderId}`)
        .on('broadcast', { event: 'status' }, (message) => {
          const payload = (message.payload ?? {}) as { id?: string; status?: string };
          const id = payload.id;
          const status = payload.status;
          if (!id || !status) return;
          setOrders((prev) => {
            const existing = prev.find((o) => o.id === id);
            if (!existing) return prev;
            const prevStatus = previousStatusesRef.current.get(id) || existing.status;
            if (status === 'ready' && prevStatus !== 'ready') {
              notifyOrderReady(existing.order_number || existing.id.slice(0, 5));
            }
            previousStatusesRef.current.set(id, status);
            return prev.map((o) => (o.id === id ? { ...o, status } : o));
          });
        })
        .subscribe(),
    );

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-subscribe only when the set of active order ids (activeKey) changes, not on every order object mutation
  }, [activeKey, tenantId]);

  // --- Track initial statuses for transition detection ------

  useEffect(() => {
    for (const o of orders) {
      if (!previousStatusesRef.current.has(o.id)) {
        previousStatusesRef.current.set(o.id, o.status);
      }
    }
  }, [orders]);

  // --- Reorder handler: add all items to cart without cancelling --

  const handleReorder = useCallback(
    async (order: OrderRecord) => {
      // Meme reconstruction que la page de detail: taille, option, supplements
      // et note (audit d'equipe du 2026-11-27, convive #48). Avant, ce bouton
      // ajoutait le plat sans taille, et meme le NOM du plat comme identifiant
      // quand le plat avait disparu de la carte.
      const plan = await planReorder(supabaseRef.current, tenantId, order.items);
      if (!plan) {
        toast({ title: t('reorderUnavailable'), variant: 'destructive' });
        return;
      }
      for (const line of plan.lines) {
        const existingQty =
          items.find((l) => getCartItemKey(l) === getCartItemKey(line))?.quantity ?? 0;
        const toAdd = Math.min(line.quantity, remainingItemCapacity(existingQty));
        if (toAdd > 0) addToCart({ ...line, quantity: toAdd }, tenantId, true);
      }
      if (plan.toChooseAgain.length > 0) {
        toast({ title: t('reorderChooseAgain', { items: plan.toChooseAgain.join(', ') }) });
      }
      router.push(`/sites/${tenantSlug}/cart`);
    },
    [addToCart, items, router, tenantId, tenantSlug, toast, t],
  );

  // --- Derive displayed orders based on mode -------

  const displayedOrders = useMemo(
    () =>
      showHistory
        ? orders.filter((o) => TERMINAL_STATUSES.has(o.status))
        : // Any non-terminal status (incl. unrecognized ones) shows as active,
          // so no order can silently disappear from both tabs.
          orders.filter((o) => !TERMINAL_STATUSES.has(o.status)),
    [orders, showHistory],
  );

  return {
    loading,
    displayedOrders,
    handleReorder,
    showReadyBanner,
    dismissBanner,
    readyOrderNumber,
  };
}
