'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Loader2,
  ChevronDown,
  Pencil,
  ArrowLeft,
  BellRing,
  X,
  Clock,
  Users,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { useCart } from '@/contexts/CartContext';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';
import OrderTracker from './OrderTracker';

// --- Types --------------------------------------------------

interface OrderItem {
  name: string;
  name_en?: string;
  quantity: number;
  price: number;
  menu_item_id?: string;
}

interface OrderRecord {
  id: string;
  order_number: string;
  status: string;
  total: number;
  table_number: string | null;
  items: OrderItem[];
  created_at: string;
  service_type: string | null;
}

interface ClientOrdersProps {
  tenantSlug: string;
  tenantId: string;
  currency?: string;
}

// --- Constants ----------------------------------------------

const EDIT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const EDITABLE_STATUSES = new Set(['pending']);
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);
const TERMINAL_STATUSES = new Set(['delivered', 'served', 'cancelled']);

// Rough ETA per status (minutes remaining from created_at)
const ETA_TOTAL_MINUTES = 15;

// --- Helpers ------------------------------------------------

function getStoredOrderIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
  } catch {
    return [];
  }
}

function isWithinEditWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

function getMinutesRemaining(createdAt: string, status: string): number {
  if (status === 'ready' || TERMINAL_STATUSES.has(status)) return 0;
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const remainingMs = ETA_TOTAL_MINUTES * 60 * 1000 - elapsedMs;
  return Math.max(1, Math.ceil(remainingMs / 60000));
}

function shortOrderNumber(order: Pick<OrderRecord, 'order_number' | 'id'>): string {
  return `#${(order.order_number || order.id).slice(-5).toUpperCase()}`;
}

// --- Component ----------------------------------------------

export default function ClientOrders({
  tenantSlug,
  tenantId,
  currency = 'XAF',
}: ClientOrdersProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [, setTick] = useState(0); // force re-render for countdown
  const supabaseRef = useRef(createClient());
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const t = useTranslations('tenant');
  const { notifyOrderReady, showReadyBanner, dismissBanner, readyOrderNumber } =
    useClientOrderNotification();
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;

  const router = useRouter();
  const { addToCart, clearCart } = useCart();
  const { formatDisplayPrice } = useDisplayCurrency();

  // --- Load orders ------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseRef.current;
    const storedIds = getStoredOrderIds();

    if (storedIds.length === 0) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    supabase
      .from('orders')
      .select(
        'id, order_number, status, total, table_number, created_at, service_type, order_items(item_name, item_name_en, quantity, price_at_order, menu_item_id)',
      )
      .eq('tenant_id', tenantId)
      .in('id', storedIds)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error('Failed to load orders', error);
        } else {
          const mapped = (data || []).map((row: Record<string, unknown>) => ({
            ...row,
            items: (
              (row.order_items as Array<{
                item_name: string;
                item_name_en?: string;
                quantity: number;
                price_at_order: number;
                menu_item_id?: string;
              }>) || []
            ).map((oi) => ({
              name: oi.item_name,
              name_en: oi.item_name_en,
              quantity: oi.quantity,
              price: oi.price_at_order,
              menu_item_id: oi.menu_item_id,
            })),
          }));
          setOrders(mapped as OrderRecord[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // --- Realtime: listen for status changes on ALL tracked orders --

  useEffect(() => {
    const supabase = supabaseRef.current;
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length === 0) return;

    const channel = supabase
      .channel('order-status-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          setOrders((prev) => {
            // Detect transition to "ready" and notify
            const existing = prev.find((o) => o.id === updated.id);
            const prevStatus = previousStatusesRef.current.get(updated.id) || existing?.status;
            if (updated.status === 'ready' && prevStatus !== 'ready' && existing) {
              notifyOrderReady(existing.order_number || existing.id.slice(0, 5));
            }
            previousStatusesRef.current.set(updated.id, updated.status);
            return prev.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o));
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          logger.error('ClientOrders realtime channel error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orders.length, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Countdown timer: edit window + ETA ------------------

  useEffect(() => {
    const hasEditable = orders.some(
      (o) => EDITABLE_STATUSES.has(o.status) && isWithinEditWindow(o.created_at),
    );
    const hasActive = orders.some((o) => ACTIVE_STATUSES.has(o.status));
    if (!hasEditable && !hasActive) return;

    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [orders]);

  // --- Track initial statuses for transition detection ------

  useEffect(() => {
    for (const o of orders) {
      if (!previousStatusesRef.current.has(o.id)) {
        previousStatusesRef.current.set(o.id, o.status);
      }
    }
  }, [orders]);

  // --- Edit order handler -----------------------------------

  const handleEditOrder = useCallback(
    async (order: OrderRecord) => {
      setEditingOrderId(order.id);
      try {
        const supabase = supabaseRef.current;

        // Cancel the original order
        const { error } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', order.id)
          .eq('tenant_id', tenantId);

        if (error) {
          logger.error('Failed to cancel order for editing', error);
          setEditingOrderId(null);
          return;
        }

        // Clear cart and restore order items
        clearCart();

        // Small delay to ensure cart is cleared before adding items
        await new Promise((resolve) => setTimeout(resolve, 50));

        for (const item of order.items) {
          for (let i = 0; i < item.quantity; i++) {
            addToCart(
              {
                id: item.menu_item_id || item.name,
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

        // Navigate to cart
        router.push(`/sites/${tenantSlug}/cart`);
      } catch (err) {
        logger.error('Error editing order', err);
        setEditingOrderId(null);
      }
    },
    [tenantId, tenantSlug, clearCart, addToCart, router],
  );

  // --- Reorder handler: add all items to cart without cancelling --

  const handleReorder = useCallback(
    (order: OrderRecord) => {
      for (const item of order.items) {
        for (let i = 0; i < item.quantity; i++) {
          addToCart(
            {
              id: item.menu_item_id || item.name,
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
    [addToCart, router, tenantId, tenantSlug],
  );

  // --- Derive active order (most recent non-terminal) -------

  const activeOrder = useMemo(
    () => orders.find((o) => ACTIVE_STATUSES.has(o.status) && o.status !== 'ready') || null,
    [orders],
  );

  // --- Loading state ----------------------------------------

  if (loading) {
    return <OrdersSkeleton />;
  }

  // --- Empty state ------------------------------------------

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
          style={{ backgroundColor: '#F6F6F6' }}
        >
          <ShoppingBag className="w-11 h-11" style={{ color: '#B0B0B0' }} />
        </div>
        <h2
          className="mb-2"
          style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: '#1A1A1A' }}
        >
          {t('noOrders')}
        </h2>
        <p
          className="text-center mb-8 max-w-xs"
          style={{ fontSize: '13px', lineHeight: '18px', color: '#737373' }}
        >
          {t('noOrdersBrowse')}
        </p>
        <Link href={`/sites/${tenantSlug}/menu`}>
          <button
            type="button"
            className="h-12 px-8 rounded-xl text-white inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: '#1A1A1A', fontSize: '15px', fontWeight: 600 }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('viewMenu')}
          </button>
        </Link>
      </div>
    );
  }

  // --- Orders history list ----------------------------------

  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Order ready banner: #06C167, no shadow */}
      {showReadyBanner && (
        <div
          className="relative text-white rounded-xl px-4 py-4 flex items-center gap-3"
          style={{ backgroundColor: '#1A1A1A' }}
        >
          <BellRing className="w-6 h-6 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{t('orderReadyNotifTitle')}</p>
            <p className="text-xs opacity-90">
              {t('orderReadyNotifBody', { number: readyOrderNumber || '' })}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active order banner: prominent card with mini tracker */}
      {activeOrder && activeOrder.status !== 'ready' && (
        <ActiveOrderBanner order={activeOrder} onClick={() => setExpandedOrderId(activeOrder.id)} />
      )}

      {orders
        .filter((order) => order.id !== activeOrder?.id)
        .map((order) => {
          const canEdit =
            EDITABLE_STATUSES.has(order.status) && isWithinEditWindow(order.created_at);
          const isEditing = editingOrderId === order.id;
          const isExpanded = expandedOrderId === order.id;
          const isTerminal = TERMINAL_STATUSES.has(order.status);

          return (
            <motion.div
              key={order.id}
              layout
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EEEEEE',
              }}
            >
              {/* Collapsed header */}
              <button
                type="button"
                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                className="w-full text-left p-4"
                aria-expanded={isExpanded}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="whitespace-nowrap"
                        style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}
                      >
                        {shortOrderNumber(order)}
                      </span>
                      <BadgeStatus status={order.status} />
                    </div>

                    {/* Meta row: table + ETA */}
                    <div
                      className="mt-1.5 flex items-center gap-3 flex-wrap"
                      style={{ fontSize: '13px', color: '#737373' }}
                    >
                      {order.table_number && order.service_type === 'dine-in' && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {t('tableLabel', { num: order.table_number })}
                        </span>
                      )}
                      {isTerminal && (
                        <span>
                          {format(new Date(order.created_at), 'dd MMM, HH:mm', {
                            locale: dateLocale,
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>
                      {formatDisplayPrice(order.total, currency)}
                    </span>
                    <ChevronDown
                      className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}
                      style={{ color: '#B0B0B0' }}
                    />
                  </div>
                </div>

                {/* Mini tracker in collapsed view for active orders only */}
                {!isExpanded && ACTIVE_STATUSES.has(order.status) && (
                  <div className="mt-4">
                    <OrderTracker status={order.status} createdAt={order.created_at} compact />
                  </div>
                )}
              </button>

              {/* Expanded details */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div style={{ borderTop: '1px solid #EEEEEE' }}>
                      {/* Items with thumbnails */}
                      <div>
                        {(order.items || []).map((item, idx) => (
                          <div
                            key={`${item.menu_item_id || item.name}-${idx}`}
                            className="px-4 py-3 flex items-center gap-3"
                            style={{
                              borderBottom:
                                idx < order.items.length - 1 ? '1px solid #EEEEEE' : 'none',
                            }}
                          >
                            {/* Thumbnail placeholder 48x48 */}
                            <div
                              className="shrink-0 rounded-xl flex items-center justify-center"
                              style={{
                                width: 48,
                                height: 48,
                                backgroundColor: '#F6F6F6',
                                border: '1px solid #EEEEEE',
                              }}
                              aria-hidden
                            >
                              <ShoppingBag className="w-5 h-5" style={{ color: '#B0B0B0' }} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className="truncate"
                                style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A1A' }}
                              >
                                {item.name}
                              </p>
                              <p style={{ fontSize: '12px', color: '#737373' }}>
                                {item.quantity} x {formatDisplayPrice(item.price, currency)}
                              </p>
                            </div>

                            <span
                              className="whitespace-nowrap"
                              style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}
                            >
                              {formatDisplayPrice(item.price * item.quantity, currency)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Total */}
                      <div
                        className="px-4 py-3 flex items-center justify-between"
                        style={{ borderTop: '1px solid #EEEEEE' }}
                      >
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>
                          {t('total')}
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>
                          {formatDisplayPrice(order.total, currency)}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="px-4 pb-3" style={{ fontSize: '11px', color: '#B0B0B0' }}>
                        {format(new Date(order.created_at), 'dd MMM yyyy HH:mm', {
                          locale: dateLocale,
                        })}
                      </div>

                      {/* Action buttons */}
                      <div className="px-4 pb-4 space-y-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOrder(order);
                            }}
                            disabled={isEditing}
                            className="w-full h-12 rounded-xl text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{
                              backgroundColor: '#1A1A1A',
                              fontSize: '15px',
                              fontWeight: 600,
                            }}
                          >
                            {isEditing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Pencil className="w-4 h-4" />
                                {t('editOrder')}
                              </>
                            )}
                          </button>
                        )}

                        {/* Reorder button for terminal orders */}
                        {isTerminal && order.items.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReorder(order);
                            }}
                            className="w-full h-12 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #EEEEEE',
                              color: '#1A1A1A',
                              fontSize: '15px',
                              fontWeight: 600,
                            }}
                          >
                            <RotateCcw className="w-4 h-4" />
                            {t('reorder')}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
    </div>
  );
}

// --- Sub-components ------------------------------------------

function ActiveOrderBanner({ order, onClick }: { order: OrderRecord; onClick: () => void }) {
  const t = useTranslations('tenant');
  const minutesRemaining = getMinutesRemaining(order.created_at, order.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl overflow-hidden transition-transform active:scale-[0.99]"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #1A1A1A',
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A' }}>
              {t('activeOrderBannerTitle')}
            </p>
            <p className="mt-0.5" style={{ fontSize: '13px', color: '#737373' }}>
              {shortOrderNumber(order)}
            </p>
          </div>
          <div
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{
              backgroundColor: order.status === 'ready' ? '#F6F6F6' : '#F6F6F6',
              color: order.status === 'ready' ? '#1A1A1A' : '#737373',
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              {order.status === 'ready'
                ? t('readyNow')
                : t('readyInMin', { min: minutesRemaining })}
            </span>
          </div>
        </div>

        {/* Full tracker inside banner */}
        <OrderTracker status={order.status} createdAt={order.created_at} />
      </div>
    </button>
  );
}

function OrdersSkeleton() {
  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl p-4"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #EEEEEE' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="h-5 w-20 rounded-md animate-pulse"
                style={{ backgroundColor: '#F6F6F6' }}
              />
              <div
                className="h-5 w-16 rounded-md animate-pulse"
                style={{ backgroundColor: '#F6F6F6' }}
              />
            </div>
            <div
              className="h-5 w-14 rounded-md animate-pulse"
              style={{ backgroundColor: '#F6F6F6' }}
            />
          </div>
          <div
            className="h-3 w-32 rounded-md animate-pulse mb-4"
            style={{ backgroundColor: '#F6F6F6' }}
          />
          <div className="flex items-center justify-between">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex flex-col items-center flex-1">
                <div
                  className="w-7 h-7 rounded-full animate-pulse"
                  style={{ backgroundColor: '#F6F6F6' }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgeStatus({ status }: { status: string }) {
  const t = useTranslations('tenant');

  const badgeStyles: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#F6F6F6', color: '#737373' },
    confirmed: { bg: '#F6F6F6', color: '#737373' },
    preparing: { bg: '#F6F6F6', color: '#737373' },
    ready: { bg: '#F6F6F6', color: '#1A1A1A' },
    delivered: { bg: '#F6F6F6', color: '#737373' },
    served: { bg: '#F6F6F6', color: '#737373' },
    cancelled: { bg: '#FFEBEE', color: '#FF3008' },
  };

  const labels: Record<string, string> = {
    pending: t('statusPending'),
    confirmed: t('statusConfirmed'),
    preparing: t('trackerPreparing'),
    ready: t('statusReady'),
    delivered: t('statusDelivered'),
    served: t('statusServed'),
    cancelled: t('statusCancelled'),
  };

  const label = labels[status] || t('statusPending');
  const colors = badgeStyles[status] || badgeStyles.pending;

  return (
    <span
      className="px-2.5 py-1 rounded-lg"
      style={{
        fontSize: '11px',
        lineHeight: '15px',
        fontWeight: 500,
        backgroundColor: colors.bg,
        color: colors.color,
      }}
    >
      {label}
    </span>
  );
}
