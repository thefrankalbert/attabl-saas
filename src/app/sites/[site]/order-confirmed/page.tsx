'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/utils/currency';
import { CheckCircle, ChevronLeft, Loader2, Utensils } from 'lucide-react';
import Link from 'next/link';
import OrderProgressBar from '@/components/tenant/OrderProgressBar';

// ─── Types ───────────────────────────────────────────────
interface OrderData {
  id: string;
  order_number: string;
  table_number: string | null;
  total: number;
  status: string;
  created_at: string;
  items: Array<{ name: string; name_en?: string; quantity: number; price: number }>;
}

// ─── Inner Content (needs Suspense for useSearchParams) ──
function OrderConfirmedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId');
  const { slug: tenantSlug, tenantId } = useTenant();
  const t = useTranslations('tenant');
  const currency = 'XAF';

  const supabaseRef = useRef(createClient());
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(true);

  const menuPath = `/sites/${tenantSlug}`;
  const ordersPath = `/sites/${tenantSlug}/orders`;

  // Brief success animation
  useEffect(() => {
    const timer = setTimeout(() => setShowSuccess(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Fetch order details
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;

    supabase
      .from('orders')
      .select('id, order_number, table_number, total, status, created_at, items')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setOrder(data as OrderData);
        }
        setLoading(false);
      });

    // Real-time updates
    const channel = supabase
      .channel(`order_confirmed_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as OrderData;
          setOrder((prev) =>
            prev ? { ...prev, status: updated.status, total: updated.total } : prev,
          );
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [orderId, tenantId]);

  // ─── Success animation overlay ─────────────────────────
  if (showSuccess) {
    return (
      <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center animate-bounce-in"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              <CheckCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
            </div>
            <div
              className="absolute inset-0 w-20 h-20 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            />
          </div>
          <p className="mt-6 text-lg font-bold text-neutral-900">{t('orderSent')}</p>
        </div>

        <style jsx>{`
          @keyframes bounce-in {
            0% {
              transform: scale(0);
              opacity: 0;
            }
            60% {
              transform: scale(1.15);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-bounce-in {
            animation: bounce-in 0.5s ease-out;
          }
        `}</style>
      </main>
    );
  }

  // ─── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </main>
    );
  }

  // ─── Order not found ──────────────────────────────────
  if (!order) {
    return (
      <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4">
        <p className="text-neutral-500 mb-4">{t('orderNotFound')}</p>
        <Link
          href={menuPath}
          className="text-white px-6 py-3 rounded-xl font-medium"
          style={{ backgroundColor: 'var(--tenant-primary)' }}
        >
          {t('backToMenu')}
        </Link>
      </main>
    );
  }

  // ─── Order confirmed view ─────────────────────────────
  return (
    <main className="min-h-screen bg-neutral-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center">
          <button
            onClick={() => router.push(menuPath)}
            className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold text-neutral-900">
              {order.status === 'ready' ? t('orderReadyTitle') : t('orderSent')}
            </h1>
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Order card */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          {/* Order header */}
          <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-900">
                {t('orderNumber', { number: order.order_number || order.id.slice(0, 5) })}
              </h2>
              <div
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--tenant-primary)' }}
              >
                <CheckCircle className="w-3 h-3" />
                <span>
                  {order.status === 'pending'
                    ? t('statusPending')
                    : order.status === 'confirmed'
                      ? t('statusConfirmed')
                      : order.status === 'preparing'
                        ? t('statusInKitchen')
                        : order.status === 'ready'
                          ? t('statusReady')
                          : t('statusServed')}
                </span>
              </div>
            </div>

            {order.table_number && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                  Table
                </span>
                <span className="text-sm font-black text-neutral-900 font-mono">
                  {order.table_number}
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="px-5 py-2">
            <OrderProgressBar status={order.status} />
          </div>

          {/* Items */}
          <div className="px-5 py-4 border-t border-neutral-100">
            <div className="space-y-2">
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-neutral-600">
                    <span className="font-bold" style={{ color: 'var(--tenant-primary)' }}>
                      {item.quantity}x
                    </span>{' '}
                    {item.name}
                  </span>
                  <span className="font-semibold text-neutral-900">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="px-5 py-4 bg-neutral-50/50 border-t border-neutral-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                Total
              </span>
              <span className="text-xl font-black text-neutral-900">
                {formatCurrency(order.total, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Live tracking indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          {t('liveTracking')}
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pt-2">
          <Link href={ordersPath} className="block">
            <button
              className="w-full h-14 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              {t('trackOrder')}
            </button>
          </Link>
          <Link href={menuPath} className="block">
            <button className="w-full h-12 rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2">
              <Utensils className="w-4 h-4" />
              {t('backToMenu')}
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}

// ─── Page export with Suspense ───────────────────────────
export default function OrderConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      }
    >
      <OrderConfirmedContent />
    </Suspense>
  );
}
