'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Loader2, ChevronDown, Pencil, ArrowLeft, BellRing, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { useCart } from '@/contexts/CartContext';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';

// ─── Types ──────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────

const EDIT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const EDITABLE_STATUSES = new Set(['pending']);

// ─── Helpers ────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────

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
  const seg = useSegmentTerms();
  const { notifyOrderReady, showReadyBanner, dismissBanner, readyOrderNumber } =
    useClientOrderNotification();
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;

  const router = useRouter();
  const { addToCart, clearCart } = useCart();
  const { formatDisplayPrice } = useDisplayCurrency();

  // ─── Load orders ────────────────────────────────────────

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

  // ─── Realtime: listen for status changes on ALL tracked orders ──

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

  // ─── Countdown timer for edit window ───────────────────

  useEffect(() => {
    const hasEditable = orders.some(
      (o) => EDITABLE_STATUSES.has(o.status) && isWithinEditWindow(o.created_at),
    );
    if (!hasEditable) return;

    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [orders]);

  // ─── Track initial statuses for transition detection ───

  useEffect(() => {
    for (const o of orders) {
      if (!previousStatusesRef.current.has(o.id)) {
        previousStatusesRef.current.set(o.id, o.status);
      }
    }
  }, [orders]);

  // ─── Edit order handler ────────────────────────────────

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
          // addToCart sets quantity=1 on first add, then increments
          // So we call it once per unit to restore the original quantity
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

  // ─── Loading state ────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-app-text-muted" />
      </div>
    );
  }

  // ─── Empty state ──────────────────────────────────────

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-20 h-20 bg-app-elevated rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-10 h-10 text-app-text-muted/40" />
        </div>
        <h2 className="text-xl font-bold text-app-text mb-2">{t('noOrders')}</h2>
        <p className="text-sm text-app-text-muted text-center mb-8 max-w-xs">{t('noOrdersDesc')}</p>
        <Link href={`/sites/${tenantSlug}/menu`}>
          <button
            className="h-12 px-8 rounded-xl text-white font-semibold inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('viewMenu')}
          </button>
        </Link>
      </div>
    );
  }

  // ─── Orders history list ──────────────────────────────

  return (
    <div
      className="space-y-3 px-4"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Order ready banner */}
      {showReadyBanner && (
        <div className="relative bg-emerald-500 text-white rounded-xl px-4 py-4 flex items-center gap-3 shadow-lg">
          <BellRing className="w-6 h-6 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{t('orderReadyNotifTitle')}</p>
            <p className="text-xs opacity-90">
              {t('orderReadyNotifBody', { number: readyOrderNumber || '' })}
            </p>
          </div>
          <button
            onClick={dismissBanner}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {orders.map((order) => {
        const canEdit = EDITABLE_STATUSES.has(order.status) && isWithinEditWindow(order.created_at);
        const isEditing = editingOrderId === order.id;

        return (
          <motion.div
            key={order.id}
            layout
            className="bg-app-card rounded-xl border border-app-border overflow-hidden"
          >
            {/* Collapsed header */}
            <button
              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <BadgeStatus status={order.status} />
                <span className="text-sm font-semibold text-app-text">
                  #{order.order_number || order.id.slice(0, 5)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--tenant-primary)' }}>
                  {formatDisplayPrice(order.total, currency)}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-app-text-muted transition-transform',
                    expandedOrderId === order.id && 'rotate-180',
                  )}
                />
              </div>
            </button>

            {/* Expanded details */}
            <AnimatePresence>
              {expandedOrderId === order.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-app-border/50">
                    {/* Items - matching cart item layout */}
                    <div className="divide-y divide-app-border/50">
                      {(order.items || []).map((item: OrderItem, idx: number) => (
                        <div key={idx} className="px-4 py-3 flex items-center gap-3">
                          <span
                            className="text-sm font-bold w-6 text-center"
                            style={{ color: 'var(--tenant-primary)' }}
                          >
                            {item.quantity}
                          </span>
                          <span className="flex-1 text-sm text-app-text">{item.name}</span>
                          <span className="text-sm font-bold text-app-text whitespace-nowrap">
                            {formatDisplayPrice(item.price * item.quantity, currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Total - matching cart style */}
                    <div className="px-4 py-3 border-t border-app-border">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-app-text">{t('total')}</span>
                        <span className="text-xl font-black text-app-text">
                          {formatDisplayPrice(order.total, currency)}
                        </span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="px-4 pb-3 text-xs text-app-text-muted">
                      {format(new Date(order.created_at), 'dd MMM yyyy HH:mm', {
                        locale: dateLocale,
                      })}
                    </div>

                    {/* Edit button - visible only for pending orders within 3 min */}
                    {canEdit && (
                      <div className="px-4 pb-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditOrder(order);
                          }}
                          disabled={isEditing}
                          className="w-full h-12 rounded-xl text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                          style={{ backgroundColor: 'var(--tenant-primary)' }}
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
                      </div>
                    )}

                    {/* "En preparation" message when kitchen has started */}
                    {!canEdit && order.status === 'preparing' && (
                      <div className="px-4 pb-4">
                        <div className="w-full h-10 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold flex items-center justify-center gap-2">
                          {seg.inProduction}
                        </div>
                      </div>
                    )}
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

// ─── Sub-components ──────────────────────────────────────

function BadgeStatus({ status }: { status: string }) {
  const t = useTranslations('tenant');
  const seg = useSegmentTerms();

  const styles: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    confirmed: 'bg-blue-50 text-blue-700',
    preparing: 'bg-blue-50 text-blue-700',
    ready: 'bg-emerald-50 text-emerald-700',
    delivered: 'bg-neutral-100 text-neutral-600',
    served: 'bg-neutral-100 text-neutral-600',
    cancelled: 'bg-red-50 text-red-600',
  };

  const labels: Record<string, string> = {
    pending: t('statusPending'),
    confirmed: t('statusConfirmed'),
    preparing: seg.inProduction,
    ready: t('statusReady'),
    delivered: t('statusDelivered'),
    served: t('statusServed'),
    cancelled: t('statusCancelled'),
  };

  const label = labels[status] || t('statusPending');

  return (
    <span
      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${styles[status] || styles.pending}`}
    >
      {label}
    </span>
  );
}
