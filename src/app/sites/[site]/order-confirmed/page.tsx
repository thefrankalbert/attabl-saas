'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { CheckCircle, Loader2, Utensils } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/tenant/BottomNav';

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
  const orderId = searchParams.get('orderId');
  const { slug: tenantSlug, tenantId } = useTenant();
  const t = useTranslations('tenant');
  const { formatDisplayPrice } = useDisplayCurrency();

  const supabaseRef = useRef(createClient());
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(true);

  const menuPath = `/sites/${tenantSlug}/menu`;

  // Brief success animation
  useEffect(() => {
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch order details (one-time, no realtime)
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;

    supabase
      .from('orders')
      .select(
        'id, order_number, table_number, total, status, created_at, order_items(item_name, item_name_en, quantity, price_at_order)',
      )
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const mapped: OrderData = {
            ...data,
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
      <div className="max-w-lg mx-auto px-4 pt-10 space-y-6">
        {/* Success header */}
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            <CheckCircle className="w-9 h-9 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-neutral-900">{t('orderSent')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t('orderNumber', { number: order.order_number || order.id.slice(0, 5) })}
          </p>
        </div>

        {/* Order summary card */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          {order.table_number && (
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                Table
              </span>
              <span className="text-sm font-black text-neutral-900 font-mono">
                {order.table_number}
              </span>
            </div>
          )}

          {/* Items */}
          <div className="px-5 py-4">
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
                    {formatDisplayPrice(item.price * item.quantity)}
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
                {formatDisplayPrice(order.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Back to menu */}
        <Link href={menuPath} className="block">
          <button
            className="w-full h-14 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            <Utensils className="w-5 h-5" />
            {t('backToMenu')}
          </button>
        </Link>
      </div>

      {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
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
