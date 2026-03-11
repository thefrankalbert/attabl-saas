'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/tenant/BottomNav';

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

  // ─── Success animation overlay ─────────────────────────
  if (showSuccess) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center animate-fade-up">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 12%, transparent)',
            }}
          >
            <Check
              className="w-7 h-7"
              style={{ color: 'var(--tenant-primary)' }}
              strokeWidth={2.5}
            />
          </div>
          <p className="mt-5 text-lg font-bold text-neutral-900">{t('orderSent')}</p>
          <p className="mt-1 text-sm text-neutral-400">{t('orderBeingPrepared')}</p>
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
          <Link
            href={menuPath}
            className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold text-neutral-900">{t('orderSent')}</h1>
            <p className="text-xs text-neutral-400">
              {t('orderNumber', { number: order.order_number || order.id.slice(0, 5) })}
            </p>
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Success indicator */}
        <div className="text-center py-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 12%, transparent)',
            }}
          >
            <Check
              className="w-6 h-6"
              style={{ color: 'var(--tenant-primary)' }}
              strokeWidth={2.5}
            />
          </div>
          <p className="mt-3 text-sm text-neutral-500">{t('orderBeingPrepared')}</p>
        </div>

        {/* Order summary card — same style as cart */}
        <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {order.table_number && (
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">
                {t('tableLabel')}
              </span>
              <span className="text-sm font-bold text-neutral-900 font-mono">
                {order.table_number}
              </span>
            </div>
          )}

          {/* Items */}
          <div className="divide-y divide-neutral-100">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="text-sm font-bold w-6 text-center"
                  style={{ color: 'var(--tenant-primary)' }}
                >
                  {item.quantity}
                </span>
                <span className="flex-1 text-sm text-neutral-900">{item.name}</span>
                <span className="text-sm font-bold text-neutral-900 whitespace-nowrap">
                  {formatDisplayPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Tip + Total */}
          <div className="px-4 py-3 border-t border-neutral-200 space-y-2">
            {order.tip_amount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">{t('tip')}</span>
                <span className="text-emerald-600 font-medium">
                  +{formatDisplayPrice(order.tip_amount)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-neutral-900">{t('total')}</span>
              <span className="text-xl font-black text-neutral-900">
                {formatDisplayPrice(order.total + order.tip_amount)}
              </span>
            </div>
          </div>
        </section>

        {/* Back to menu */}
        <Link href={menuPath} className="block">
          <button
            className="w-full h-14 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
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
