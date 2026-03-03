'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, XCircle, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import OrderProgressBar from './OrderProgressBar';

// ─── Types ──────────────────────────────────────────────

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
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

const CANCELLABLE_STATUSES = ['pending'];

// ─── Helpers ────────────────────────────────────────────

function getStoredOrderIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
  } catch {
    return [];
  }
}

// ─── Component ──────────────────────────────────────────

export default function ClientOrders({
  tenantSlug,
  tenantId,
  currency = 'XAF',
}: ClientOrdersProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const t = useTranslations('tenant');
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;

  // ─── Load orders + Supabase Realtime ─────────────────

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
      .select('id, order_number, status, total, table_number, items, created_at, service_type')
      .eq('tenant_id', tenantId)
      .in('id', storedIds)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load orders:', error);
        } else {
          setOrders((data as OrderRecord[]) || []);
        }
        setLoading(false);
      });

    // Real-time status updates
    const channel = supabase
      .channel(`client_orders_realtime_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const updated = payload.new as OrderRecord;
          if (storedIds.includes(updated.id)) {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === updated.id ? { ...o, status: updated.status, total: updated.total } : o,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // ─── Cancel order ─────────────────────────────────────

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    setConfirmCancelId(null);

    const supabase = supabaseRef.current;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .in('status', CANCELLABLE_STATUSES);

    if (error) {
      console.error('Failed to cancel order:', error);
    } else {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o)));
    }

    setCancellingId(null);
  };

  // ─── Derived ──────────────────────────────────────────

  const activeOrders = orders.filter((o) => !['served', 'cancelled'].includes(o.status));
  const pastOrders = orders.filter((o) => ['served', 'cancelled'].includes(o.status));

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
          href={`/sites/${tenantSlug}`}
          className="text-white px-6 py-3 rounded-xl font-medium active:scale-95 transition-all"
          style={{ backgroundColor: 'var(--tenant-primary)' }}
        >
          {t('viewMenu')}
        </Link>
      </div>
    );
  }

  // ─── Orders list ──────────────────────────────────────

  return (
    <div className="space-y-6 pb-24">
      {/* Live tracking indicator */}
      <div className="flex items-center gap-2 text-xs text-neutral-400 px-1">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        {t('liveTracking')}
      </div>

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest px-1">
            {t('activeOrder')}
          </h2>
          {activeOrders.map((order) => (
            <motion.div
              key={order.id}
              layout
              className="bg-white rounded-2xl border border-neutral-100 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-neutral-900">
                  {t('orderNumber', { number: order.order_number || order.id.slice(0, 5) })}
                </h3>
                <span className="text-xs text-neutral-400">
                  {format(new Date(order.created_at), 'dd MMM HH:mm', { locale: dateLocale })}
                </span>
              </div>

              <OrderProgressBar status={order.status} />

              {/* Items */}
              <div className="space-y-1">
                {(order.items || []).map((item: OrderItem, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm text-neutral-600">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span>{formatCurrency(item.price * item.quantity, currency)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between items-center pt-2 border-t border-neutral-50">
                <span className="text-neutral-500 text-sm">{t('total')}</span>
                <span className="font-bold text-lg" style={{ color: 'var(--tenant-primary)' }}>
                  {formatCurrency(order.total, currency)}
                </span>
              </div>

              {/* Cancel button (pending only) */}
              {CANCELLABLE_STATUSES.includes(order.status) && (
                <div className="pt-1">
                  {confirmCancelId === order.id ? (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700 flex-1">{t('cancelOrderConfirm')}</p>
                      <button
                        onClick={() => handleCancel(order.id)}
                        disabled={cancellingId === order.id}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {cancellingId === order.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          t('confirm')
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmCancelId(null)}
                        className="px-3 py-1.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded-lg hover:bg-neutral-200 transition-colors"
                      >
                        {t('no')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmCancelId(order.id)}
                      className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('cancelOrder')}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Past Orders */}
      {pastOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest px-1">
            {t('previousOrders')}
          </h2>
          {pastOrders.map((order) => (
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
                    {formatCurrency(order.total, currency)}
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
                            <span>{formatCurrency(item.price * item.quantity, currency)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-neutral-400 pt-1">
                        {format(new Date(order.created_at), 'dd MMM yyyy HH:mm', {
                          locale: dateLocale,
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
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
