'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Loader2, ChevronDown, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { useCart } from '@/contexts/CartContext';

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

const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
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

function getRemainingMs(createdAt: string): number {
  return Math.max(0, EDIT_WINDOW_MS - (Date.now() - new Date(createdAt).getTime()));
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
  const t = useTranslations('tenant');
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;
  const lang = locale.startsWith('en') ? 'en' : 'fr';
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

  // ─── Realtime: listen for status changes on recent orders ──

  useEffect(() => {
    const supabase = supabaseRef.current;
    const recentPendingIds = orders
      .filter((o) => EDITABLE_STATUSES.has(o.status) && isWithinEditWindow(o.created_at))
      .map((o) => o.id);

    if (recentPendingIds.length === 0) return;

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
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o)),
          );
        },
      )
      .subscribe();

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
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // ─── Empty state ──────────────────────────────────────

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-neutral-400">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">{t('noOrders')}</h2>
        <p className="text-neutral-500 mb-8 max-w-xs">{t('noOrdersDesc')}</p>
        <Link
          href={`/sites/${tenantSlug}/menu`}
          className="text-white px-6 py-3 rounded-xl font-medium active:scale-95 transition-all"
          style={{ backgroundColor: 'var(--tenant-primary)' }}
        >
          {t('viewMenu')}
        </Link>
      </div>
    );
  }

  // ─── Orders history list ──────────────────────────────

  return (
    <div className="space-y-3 pb-24">
      {orders.map((order) => {
        const canEdit = EDITABLE_STATUSES.has(order.status) && isWithinEditWindow(order.created_at);
        const remainingMs = canEdit ? getRemainingMs(order.created_at) : 0;
        const remainingMin = Math.floor(remainingMs / 60000);
        const remainingSec = Math.floor((remainingMs % 60000) / 1000);
        const isEditing = editingOrderId === order.id;

        return (
          <motion.div
            key={order.id}
            layout
            className="bg-white rounded-2xl border border-neutral-100 overflow-hidden"
          >
            {/* Collapsed header */}
            <button
              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <BadgeStatus status={order.status} />
                <span className="text-sm font-semibold text-neutral-900">
                  #{order.order_number || order.id.slice(0, 5)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--tenant-primary)' }}>
                  {formatDisplayPrice(order.total, currency)}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-neutral-400 transition-transform',
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
                  <div className="px-4 pb-4 space-y-2 border-t border-neutral-50">
                    <div className="pt-3 space-y-1">
                      {(order.items || []).map((item: OrderItem, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm text-neutral-600">
                          <span>
                            {item.quantity}x {item.name}
                          </span>
                          <span>{formatDisplayPrice(item.price * item.quantity, currency)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-neutral-50">
                      <span className="text-neutral-500 text-sm">{t('total')}</span>
                      <span
                        className="font-bold text-base"
                        style={{ color: 'var(--tenant-primary)' }}
                      >
                        {formatDisplayPrice(order.total, currency)}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 pt-1">
                      {format(new Date(order.created_at), 'dd MMM yyyy HH:mm', {
                        locale: dateLocale,
                      })}
                    </div>

                    {/* Edit button — visible only for pending orders within 5 min */}
                    {canEdit && (
                      <div className="pt-3 border-t border-neutral-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditOrder(order);
                          }}
                          disabled={isEditing}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                          style={{
                            backgroundColor: 'var(--tenant-primary)',
                            color: '#ffffff',
                          }}
                        >
                          {isEditing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Pencil className="w-4 h-4" />
                              {lang === 'fr' ? 'Modifier la commande' : 'Edit order'}
                              <span className="ml-1 text-xs opacity-75 font-mono">
                                {remainingMin}:{remainingSec.toString().padStart(2, '0')}
                              </span>
                            </>
                          )}
                        </button>
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

  const styles: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
    preparing: 'bg-purple-50 text-purple-700 border-purple-100',
    ready: 'bg-green-50 text-green-700 border-green-100',
    served: 'bg-neutral-50 text-neutral-700 border-neutral-100',
    cancelled: 'bg-red-50 text-red-700 border-red-100',
  };

  const labelKeys: Record<string, string> = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    preparing: 'statusInKitchen',
    ready: 'statusReady',
    served: 'statusServed',
    cancelled: 'statusCancelled',
  };

  const labelKey = labelKeys[status] || 'statusPending';

  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status] || styles.pending}`}
    >
      {t(labelKey)}
    </span>
  );
}
