'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { ShoppingBag, ArrowLeft, ArrowRight, BellRing, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { getCartItemKey } from '@/components/tenant/cart/CartItemsList';
import { remainingItemCapacity } from '@/lib/utils/cart-display';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';

// --- Types --------------------------------------------------

// Shape returned by the get_orders_for_tracking RPC (non-PII columns only).
interface TrackedClientItemRow {
  item_name: string;
  item_name_en?: string | null;
  quantity: number;
  price_at_order: number;
  menu_item_id?: string | null;
  image_url?: string | null;
}

interface TrackedClientRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  tip_amount: number | null;
  table_number: string | null;
  created_at: string;
  service_type: string | null;
  order_items: TrackedClientItemRow[] | null;
}

interface OrderItem {
  name: string;
  name_en?: string;
  quantity: number;
  price: number;
  menu_item_id?: string;
  image_url?: string | null;
}

interface OrderRecord {
  id: string;
  order_number: string;
  status: string;
  total: number;
  tip_amount: number;
  table_number: string | null;
  items: OrderItem[];
  created_at: string;
  service_type: string | null;
}

// Grand total actually paid (the stored `total` excludes the tip, which is a
// separate column - mirror the order detail / tracking screens).
function grandTotal(o: { total: number; tip_amount: number }): number {
  return o.total + o.tip_amount;
}

interface ClientOrdersProps {
  tenantSlug: string;
  tenantId: string;
  currency?: string;
  /** When true, shows terminal orders (history) instead of active ones */
  showHistory?: boolean;
}

// --- Constants ----------------------------------------------

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);
const TERMINAL_STATUSES = new Set(['delivered', 'served', 'completed', 'cancelled']);

// --- Helpers ------------------------------------------------

function getStoredOrderIds(tenantSlug: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    // Namespaced per tenant so customers who order from multiple ATTABL
    // restaurants on the same device don't see ID leak across tenants.
    return JSON.parse(localStorage.getItem(`attabl_${tenantSlug}_order_ids`) || '[]');
  } catch {
    return [];
  }
}

// --- Component ----------------------------------------------

export default function ClientOrders({
  tenantSlug,
  tenantId,
  currency = 'XAF',
  showHistory = false,
}: ClientOrdersProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const t = useTranslations('tenant');
  const { notifyOrderReady, showReadyBanner, dismissBanner, readyOrderNumber } =
    useClientOrderNotification();
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;

  const router = useRouter();
  const { addToCart, items } = useCart();
  const { formatDisplayPrice } = useDisplayCurrency();

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
          const mapped: OrderRecord[] = ((data as unknown as TrackedClientRow[]) || []).map(
            (row) => ({
              id: row.id,
              order_number: row.order_number,
              status: row.status,
              total: row.total,
              tip_amount: row.tip_amount ?? 0,
              table_number: row.table_number,
              created_at: row.created_at,
              service_type: row.service_type,
              items: (row.order_items || []).map((oi) => ({
                name: oi.item_name,
                name_en: oi.item_name_en ?? undefined,
                quantity: oi.quantity,
                price: oi.price_at_order,
                menu_item_id: oi.menu_item_id ?? undefined,
                image_url: oi.image_url ?? null,
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
  }, [tenantId, tenantSlug]);

  // --- Realtime: listen for status changes on ACTIVE orders only --

  const activeOrderIds = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.has(o.status)).map((o) => o.id),
    [orders],
  );

  useEffect(() => {
    if (activeOrderIds.length === 0) return;

    const supabase = supabaseRef.current;

    // Live status via Broadcast on a public per-tenant topic (DB trigger
    // broadcast_order_status). Payload is non-PII ({ id, status }); the client
    // ignores broadcasts for orders it does not hold. Replaces the anon
    // postgres_changes subscription (which leaked the full order row to anon).
    const channel = supabase
      .channel(`tenant-orders:${tenantId}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-subscribe only when active order count changes, not on every order object mutation (2026-05-04)
  }, [activeOrderIds.length, tenantId]);

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
    (order: OrderRecord) => {
      for (const item of order.items) {
        const key = item.menu_item_id || item.name;
        const existingQty = items.find((l) => getCartItemKey(l) === key)?.quantity ?? 0;
        const toAdd = Math.min(item.quantity, remainingItemCapacity(existingQty));
        for (let i = 0; i < toAdd; i++) {
          addToCart(
            {
              id: key,
              name: item.name,
              name_en: item.name_en,
              price: item.price,
              quantity: 1,
            },
            tenantId,
            true,
          );
        }
      }
      router.push(`/sites/${tenantSlug}/cart`);
    },
    [addToCart, items, router, tenantId, tenantSlug],
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

  const activeStatusLabel: Record<string, string> = {
    pending: t('statusPending'),
    confirmed: t('statusConfirmed'),
    preparing: t('trackerPreparing'),
    ready: t('statusReady'),
  };

  // --- Loading state ----------------------------------------

  if (loading) {
    return <OrdersSkeleton />;
  }

  // --- Empty state -----------------------

  if (displayedOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-app-elevated">
          <ShoppingBag className="w-11 h-11 text-app-text-muted" />
        </div>
        <h2 className="mb-2 text-xl leading-[28px] font-bold text-app-text">
          {showHistory ? t('noOrdersDesc') : t('noOrders')}
        </h2>
        <p className="text-center mb-8 max-w-xs text-[13px] leading-[18px] text-app-text-secondary">
          {showHistory ? t('noOrdersBrowse') : t('noOrdersBrowse')}
        </p>
        {!showHistory && (
          <Button
            asChild
            className="h-12 px-8 rounded-xl bg-app-text text-white text-[15px] font-semibold hover:bg-black"
          >
            <Link href={`/sites/${tenantSlug}/menu`}>
              <ArrowLeft className="w-4 h-4" />
              {t('viewMenu')}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  // --- Orders history list ----------------------------------

  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Order ready banner (active mode only) */}
      {!showHistory && showReadyBanner && (
        <div className="text-white rounded-xl px-4 py-4 flex items-center gap-3 bg-app-text">
          <BellRing className="w-6 h-6 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{t('orderReadyNotifTitle')}</p>
            <p className="text-xs opacity-90">
              {t('orderReadyNotifBody', { number: readyOrderNumber || '' })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismissBanner}
            className="rounded-full hover:bg-white/20 shrink-0 min-h-[44px] min-w-[44px] text-white"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {displayedOrders.map((order) => {
        const isTerminal = TERMINAL_STATUSES.has(order.status);
        const thumbs = (order.items || []).filter((i) => i.image_url).slice(0, 3);

        if (isTerminal) {
          const dateStr = format(new Date(order.created_at), 'dd MMM, HH:mm', {
            locale: dateLocale,
          });
          const statusStr = order.status === 'cancelled' ? t('statusCancelled') : t('statusServed');
          return (
            <div
              key={order.id}
              className="relative flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-3.5 py-[13px]"
            >
              <Link
                href={`/sites/${tenantSlug}/orders/${order.id}`}
                className="absolute inset-0 rounded-[var(--radius-card)]"
                aria-label={order.order_number}
              />
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-brand-light)]">
                <Check
                  className="h-[18px] w-[18px] text-[var(--color-brand-dark)]"
                  strokeWidth={2.4}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12.5px] font-semibold tracking-[0.2px] text-[var(--color-ink)]">
                  {order.order_number}
                </div>
                <div className="mt-px text-[11.5px] text-[var(--color-ink-muted)]">
                  {dateStr} - {statusStr}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                  {formatDisplayPrice(grandTotal(order), currency)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleReorder(order)}
                  className="relative z-10 mt-0.5 h-auto p-0 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-transparent"
                >
                  {t('reorderShort')}
                </Button>
              </div>
            </div>
          );
        }

        return (
          <Link
            key={order.id}
            href={`/sites/${tenantSlug}/order-confirmed?orderId=${order.id}&view=tracking`}
            className="block overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white"
          >
            <div className="px-4 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-brand-light)] px-2 py-[3px] font-mono text-[10.5px] font-medium uppercase tracking-[0.3px] text-[var(--color-brand-dark)]">
                    <span className="track-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
                    {activeStatusLabel[order.status] ?? order.status}
                  </span>
                  <div className="mt-2 text-[18px] font-semibold tracking-[-0.5px] text-[var(--color-ink)]">
                    {activeStatusLabel[order.status] ?? order.status}
                  </div>
                  <div className="mt-px font-mono text-[11.5px] text-[var(--color-ink-muted)]">
                    {order.order_number}
                    {order.table_number ? ` - ${t('table')} ${order.table_number}` : ''}
                  </div>
                </div>
                {thumbs.length > 0 && (
                  <div className="flex shrink-0">
                    {thumbs.map((it, i) => (
                      <div
                        key={i}
                        className="h-11 w-11 overflow-hidden rounded-[var(--radius-search)] border-2 border-white"
                        style={{ marginLeft: i === 0 ? 0 : -14 }}
                      >
                        <Image
                          src={it.image_url!}
                          alt=""
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-4 py-[11px]">
              <span className="text-[12.5px] font-semibold text-[var(--color-ink-2)]">
                {t('trackLive')}
              </span>
              <ArrowRight className="h-[15px] w-[15px] text-[var(--color-ink-2)]" strokeWidth={2} />
            </div>
          </Link>
        );
      })}

      <style jsx>{`
        @keyframes track-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .track-pulse {
          animation: track-pulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ------------------------------------------

function OrdersSkeleton() {
  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl p-4 bg-white border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded-md animate-pulse bg-app-elevated" />
              <div className="h-5 w-16 rounded-md animate-pulse bg-app-elevated" />
            </div>
            <div className="h-5 w-14 rounded-md animate-pulse bg-app-elevated" />
          </div>
          <div className="h-3 w-32 rounded-md animate-pulse mb-4 bg-app-elevated" />
          <div className="flex items-center justify-between">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex flex-col items-center flex-1">
                <div className="w-7 h-7 rounded-full animate-pulse bg-app-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
