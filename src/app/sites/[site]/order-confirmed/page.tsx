'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { Check, Loader2, ArrowLeft, ChefHat, Bell, BellRing, X } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/tenant/BottomNav';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────
interface OrderData {
  id: string;
  order_number: string;
  table_number: string | null;
  total: number;
  tip_amount: number;
  status: string;
  created_at: string;
  items: Array<{ name: string; name_en?: string; quantity: number; price: number }>;
}

// ─── Status messages (simple, no pressure on kitchen) ────

// ─── Inner Content (needs Suspense for useSearchParams) ──
function OrderConfirmedContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { slug: tenantSlug, tenantId } = useTenant();
  const t = useTranslations('tenant');
  const { formatDisplayPrice } = useDisplayCurrency();

  const supabaseRef = useRef(createClient());
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(true);
  const previousStatusRef = useRef<string | null>(null);

  const {
    requestPermission,
    permissionState,
    notifyOrderReady,
    showReadyBanner,
    dismissBanner,
    readyOrderNumber,
  } = useClientOrderNotification();

  // Ref to avoid re-subscribing realtime channel when notifyOrderReady changes
  const notifyOrderReadyRef = useRef(notifyOrderReady);
  useEffect(() => {
    notifyOrderReadyRef.current = notifyOrderReady;
  });

  const menuPath = `/sites/${tenantSlug}/menu`;

  // Brief success animation, then request notification permission
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSuccess(false);
      // Request permission after the animation - a subtle moment, not intrusive
      if (permissionState === 'default') {
        requestPermission();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch order details
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;

    supabase
      .from('orders')
      .select(
        'id, order_number, table_number, total, tip_amount, status, created_at, order_items(item_name, item_name_en, quantity, price_at_order)',
      )
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const mapped: OrderData = {
            ...data,
            tip_amount: data.tip_amount ?? 0,
            items: (data.order_items || []).map(
              (oi: {
                item_name: string;
                item_name_en?: string;
                quantity: number;
                price_at_order: number;
              }) => ({
                name: oi.item_name,
                name_en: oi.item_name_en,
                quantity: oi.quantity,
                price: oi.price_at_order,
              }),
            ),
          };
          setOrder(mapped);
        }
        setLoading(false);
      });
  }, [orderId, tenantId]);

  // Realtime subscription for order status changes
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`order-confirmed-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          logger.info('Order status updated via realtime', {
            orderId: updated.id,
            status: updated.status,
          });
          setOrder((prev) => {
            // Trigger notification only when transitioning TO "ready"
            if (
              updated.status === 'ready' &&
              prev &&
              prev.status !== 'ready' &&
              previousStatusRef.current !== 'ready'
            ) {
              notifyOrderReadyRef.current(prev.order_number || prev.id.slice(0, 5));
            }
            previousStatusRef.current = updated.status;
            return prev ? { ...prev, status: updated.status } : prev;
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          logger.error('Order confirmed realtime channel error');
        }
      });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [orderId, tenantId]);

  // ─── Success animation overlay ─────────────────────────
  if (showSuccess) {
    return (
      <main
        className="h-full bg-white flex flex-col items-center justify-center px-4"
        style={{ color: '#1A1A1A' }}
      >
        <div className="flex flex-col items-center animate-fade-up">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: '#E6F9F0',
            }}
          >
            <Check className="w-7 h-7" style={{ color: '#06C167' }} strokeWidth={2.5} />
          </div>
          <p className="mt-5 text-lg font-bold" style={{ color: '#1A1A1A' }}>
            {t('orderSent')}
          </p>
          <p className="mt-1 text-sm" style={{ color: '#B0B0B0' }}>
            {t('orderBeingPrepared')}
          </p>
        </div>

        <style jsx>{`
          @keyframes fade-up {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-up {
            animation: fade-up 0.4s ease-out;
          }
        `}</style>
      </main>
    );
  }

  // ─── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <main className="h-full bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B0B0B0' }} />
      </main>
    );
  }

  // ─── Order not found ──────────────────────────────────
  if (!order) {
    return (
      <main
        className="h-full bg-white flex flex-col items-center justify-center px-4"
        style={{ color: '#1A1A1A' }}
      >
        <p className="mb-4" style={{ color: '#B0B0B0' }}>
          {t('orderNotFound')}
        </p>
        <Link
          href={menuPath}
          className="text-white px-6 py-3 rounded-xl font-medium"
          style={{ backgroundColor: '#06C167' }}
        >
          {t('backToMenu')}
        </Link>
      </main>
    );
  }

  // ─── Order confirmed view ─────────────────────────────
  return (
    <main className="h-full bg-white pb-24" style={{ color: '#1A1A1A' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white" style={{ height: 56 }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center">
          <Link
            href={menuPath}
            className="p-2 -ml-2 transition-colors"
            style={{ color: '#737373' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
              {t('orderSent')}
            </h1>
            <p className="text-xs" style={{ color: '#B0B0B0' }}>
              {t('orderNumber', {
                number: (order.order_number || order.id).slice(-5).toUpperCase(),
              })}
            </p>
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Order ready banner - prominent notification */}
        {showReadyBanner && (
          <div
            className="relative text-white rounded-xl px-4 py-4 flex items-center gap-3 animate-pulse-once"
            style={{ backgroundColor: '#06C167' }}
          >
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

        {/* Notification permission prompt - shown once if not yet decided */}
        {!showReadyBanner &&
          permissionState === 'default' &&
          order.status !== 'ready' &&
          order.status !== 'delivered' && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: '#E6F9F0', color: '#06C167' }}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t('enableNotifications')}</span>
            </button>
          )}

        {/* Simple status message - no detailed tracking visible to customer */}
        <OrderStatusMessage status={order.status} />

        {/* Order summary card - same style as cart */}
        <section
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: '1px solid #EEEEEE' }}
        >
          {order.table_number && (
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(238,238,238,0.5)' }}
            >
              <span className="text-[13px] font-semibold" style={{ color: '#737373' }}>
                {t('tableLabel')}
              </span>
              <span className="text-sm font-bold font-mono" style={{ color: '#1A1A1A' }}>
                {order.table_number}
              </span>
            </div>
          )}

          {/* Items */}
          <div>
            {(order.items || []).map((item, idx) => (
              <div
                key={idx}
                className="px-4 py-3 flex items-center gap-3"
                style={{
                  borderBottom:
                    idx < order.items.length - 1 ? '1px solid rgba(238,238,238,0.5)' : 'none',
                }}
              >
                <span className="text-sm font-bold w-6 text-center" style={{ color: '#1A1A1A' }}>
                  {item.quantity}
                </span>
                <span className="flex-1 text-sm" style={{ color: '#1A1A1A' }}>
                  {item.name}
                </span>
                <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#1A1A1A' }}>
                  {formatDisplayPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Tip + Total */}
          <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid #EEEEEE' }}>
            {order.tip_amount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#B0B0B0' }}>{t('tip')}</span>
                <span className="font-medium" style={{ color: '#1A1A1A' }}>
                  +{formatDisplayPrice(order.tip_amount)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                {t('total')}
              </span>
              <span className="text-[15px] font-bold" style={{ color: '#1A1A1A' }}>
                {formatDisplayPrice(order.total + order.tip_amount)}
              </span>
            </div>
          </div>
        </section>

        {/* Back to menu */}
        <Link href={menuPath} className="block">
          <button
            className="w-full h-14 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: '#06C167' }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToMenu')}
          </button>
        </Link>
      </div>

      {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
    </main>
  );
}

// ─── Simple status message (no step-by-step tracker) ─────

function OrderStatusMessage({ status }: { status: string }) {
  const t = useTranslations('tenant');

  const config: Record<string, { message: string; bg: string; color: string }> = {
    pending: {
      message: t('orderStatusSent'),
      bg: '#F6F6F6',
      color: '#B0B0B0',
    },
    preparing: {
      message: t('orderStatusInKitchen'),
      bg: '#E6F9F0',
      color: '#06C167',
    },
    ready: {
      message: t('orderStatusReady'),
      bg: '#E6F9F0',
      color: '#06C167',
    },
    delivered: {
      message: t('orderStatusServed'),
      bg: '#F6F6F6',
      color: '#B0B0B0',
    },
    cancelled: {
      message: t('statusCancelled'),
      bg: '#FFEBEE',
      color: '#FF3008',
    },
  };

  const c = config[status] || config.pending;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
      style={{ backgroundColor: c.bg }}
    >
      <ChefHat className="w-5 h-5 shrink-0" style={{ color: c.color }} />
      <span className="text-sm font-semibold" style={{ color: c.color }}>
        {c.message}
      </span>
    </div>
  );
}

// ─── Page export with Suspense ───────────────────────────
export default function OrderConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-white flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B0B0B0' }} />
        </div>
      }
    >
      <OrderConfirmedContent />
    </Suspense>
  );
}
