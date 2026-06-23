'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import {
  Check,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ChefHat,
  ShoppingBag,
  Utensils,
  Bell,
  BellRing,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PriceStacked } from '@/components/tenant/PriceStacked';
import Image from 'next/image';
import Link from 'next/link';
import { useClientOrderNotification } from '@/hooks/useClientOrderNotification';
import { logger } from '@/lib/logger';

// --- Types -----------------------------------------------
interface OrderData {
  id: string;
  order_number: string;
  table_number: string | null;
  total: number;
  tip_amount: number;
  subtotal: number | null;
  discount_amount: number;
  tax_amount: number;
  service_charge_amount: number;
  status: string;
  created_at: string;
  items: Array<{
    name: string;
    name_en?: string;
    quantity: number;
    price: number;
    image_url?: string | null;
  }>;
}

// Shape returned by the get_orders_for_tracking RPC (non-PII columns only).
interface TrackedOrderRow {
  id: string;
  order_number: string;
  table_number: string | null;
  status: string;
  total: number;
  subtotal: number | null;
  tip_amount: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  service_charge_amount: number | null;
  service_type: string | null;
  created_at: string;
  order_items: Array<{
    item_name: string;
    item_name_en: string | null;
    quantity: number;
    price_at_order: number;
    menu_item_id: string | null;
    image_url: string | null;
  }> | null;
}

// --- Inner Content (needs Suspense for useSearchParams) --
function OrderConfirmedContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { slug: tenantSlug, tenantId } = useTenant();
  const t = useTranslations('tenant');
  const { formatDisplayPrice } = useDisplayCurrency();

  const supabaseRef = useRef(createClient());
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  // 'confirmation' = minimal success screen (maquette); 'tracking' = live order view.
  // Deep-link from the orders list ("Suivre en temps reel") opens straight to tracking.
  const [view, setView] = useState<'confirmation' | 'tracking'>(
    searchParams.get('view') === 'tracking' ? 'tracking' : 'confirmation',
  );
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

  // Request notification permission a moment after landing (subtle, not intrusive)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (permissionState === 'default') {
        requestPermission();
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: one-shot 2s success animation + permission prompt on mount; adding permissionState/requestPermission would restart the timer on every permission change (2026-06-18)
  }, []);

  // Fetch order details
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;
    let cancelled = false;

    supabase
      .rpc('get_orders_for_tracking', { p_tenant_id: tenantId, p_order_ids: [orderId] })
      .then(({ data, error }) => {
        if (cancelled) return;
        const row = ((data as unknown as TrackedOrderRow[] | null) || [])[0];
        if (!error && row) {
          const mapped: OrderData = {
            id: row.id,
            order_number: row.order_number,
            table_number: row.table_number,
            total: row.total,
            status: row.status,
            created_at: row.created_at,
            tip_amount: row.tip_amount ?? 0,
            subtotal: row.subtotal ?? null,
            discount_amount: row.discount_amount ?? 0,
            tax_amount: row.tax_amount ?? 0,
            service_charge_amount: row.service_charge_amount ?? 0,
            items: (row.order_items || []).map((oi) => ({
              name: oi.item_name,
              name_en: oi.item_name_en ?? undefined,
              quantity: oi.quantity,
              price: oi.price_at_order,
              image_url: oi.image_url ?? null,
            })),
          };
          setOrder(mapped);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, tenantId]);

  // Realtime: live order status via Broadcast (DB trigger broadcast_order_status).
  // The broadcast carries a non-PII payload ({ id, status }) on a public per-order
  // topic, so anon no longer needs any table SELECT on orders to track its order
  // (the full-row postgres_changes payload to anon is removed).
  useEffect(() => {
    if (!orderId || !tenantId) return;

    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`order:${orderId}`)
      .on('broadcast', { event: 'status' }, (message) => {
        const payload = (message.payload ?? {}) as { id?: string; status?: string };
        const status = payload.status;
        if (!status) return;
        logger.info('Order status updated via realtime', {
          orderId: payload.id,
          status,
        });
        setOrder((prev) => {
          // Trigger notification only when transitioning TO "ready"
          if (
            status === 'ready' &&
            prev &&
            prev.status !== 'ready' &&
            previousStatusRef.current !== 'ready'
          ) {
            notifyOrderReadyRef.current(prev.order_number || prev.id.slice(0, 5));
          }
          previousStatusRef.current = status;
          return prev ? { ...prev, status } : prev;
        });
      })
      .subscribe((status) => {
        // Realtime is a best-effort enhancement: the order already renders from the
        // initial fetch. A channel error/timeout just means no live status updates,
        // so log it as a warning (non-fatal) rather than an error.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn('Order confirmed realtime unavailable; using fetched status', { status });
        }
      });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [orderId, tenantId]);

  // --- Loading -------------------------------------------
  if (loading) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B0B0B0' }} />
      </div>
    );
  }

  // --- Order not found ----------------------------------
  if (!order) {
    return (
      <div
        className="h-full bg-white flex flex-col items-center justify-center px-4"
        style={{ color: '#1A1A1A' }}
      >
        <p className="mb-4" style={{ color: '#B0B0B0' }}>
          {t('orderNotFound')}
        </p>
        <Link
          href={menuPath}
          className="text-white px-6 py-3 rounded-xl font-medium"
          style={{ backgroundColor: '#1A1A1A' }}
        >
          {t('backToMenu')}
        </Link>
      </div>
    );
  }

  // --- Confirmation (minimal success screen, maquette) ---
  if (view === 'confirmation') {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="relative flex flex-1 flex-col items-center justify-center px-7 text-center">
          <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
            <div className="h-40 w-40 rounded-full bg-[var(--color-brand-light)] opacity-90 blur-[40px]" />
          </div>
          <div className="confirm-pop relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-[var(--color-brand)] shadow-[0_12px_30px_rgba(6,193,103,0.4)]">
            <Check className="h-12 w-12 text-white" strokeWidth={3} />
          </div>
          <h1 className="mt-[26px] text-[24px] font-semibold tracking-[-0.7px] text-[var(--color-ink)]">
            {t('orderSent')}
          </h1>
          <p className="mt-2 max-w-[270px] text-[14px] leading-[1.5] text-[var(--color-ink-2)]">
            {t('orderConfirmedSub')}
          </p>
          <div className="mt-[18px] inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-3.5 py-2">
            <span className="font-mono text-[12px] text-[var(--color-ink-muted)]">
              {order.order_number}
            </span>
            {order.table_number && (
              <>
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-ink-soft)]" />
                <span className="text-[12px] font-semibold text-[var(--color-ink-2)]">
                  {t('tableLabel', { num: order.table_number })}
                </span>
              </>
            )}
          </div>
          <style jsx>{`
            @keyframes confirm-pop {
              0% {
                transform: scale(0);
              }
              60% {
                transform: scale(1.08);
              }
              100% {
                transform: scale(1);
              }
            }
            .confirm-pop {
              animation: confirm-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.4);
            }
          `}</style>
        </div>
        <div
          className="flex flex-col gap-2.5 px-3.5 pt-3"
          style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button
            onClick={() => setView('tracking')}
            className="h-[54px] w-full justify-center gap-2 rounded-full bg-[var(--color-ink)] px-5 text-[15px] font-semibold text-white hover:bg-black"
          >
            {t('trackOrder')}
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 w-full text-[13.5px] font-semibold text-[var(--color-ink-2)]"
          >
            <Link href={`/sites/${tenantSlug}`}>{t('backHome')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // --- Order confirmed view (tracking) ------------------
  const STATUS_TO_STEP: Record<string, number> = {
    pending: 0,
    confirmed: 0,
    preparing: 1,
    ready: 2,
    delivered: 3,
    served: 3,
    completed: 3,
  };
  const isCancelled = order.status === 'cancelled';
  const stepIdx = isCancelled ? -1 : (STATUS_TO_STEP[order.status] ?? 0);
  const steps = [
    { label: t('stepReceived'), Icon: Check },
    { label: t('stepPreparing'), Icon: ChefHat },
    { label: t('stepReady'), Icon: ShoppingBag },
    { label: t('stepDelivered'), Icon: CheckCircle2 },
  ];
  const statusLabel = isCancelled ? t('statusCancelled') : (steps[stepIdx]?.label ?? '');
  const orderedTime = new Date(order.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="h-full bg-[var(--color-surface-alt)]"
      style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* TopBar */}
      <div className="sticky top-0 z-40 border-b border-[var(--color-divider)] bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-[14px] py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView('confirmation')}
            aria-label={t('ariaGoBack')}
            className="h-[38px] w-[38px] shrink-0 rounded-full bg-[var(--color-surface-alt)] text-[#1A1A1A]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold leading-[1.15] tracking-[-0.4px] text-[var(--color-ink)]">
              {t('trackingTitle')}
            </h1>
            <div className="font-mono text-[11.5px] text-[var(--color-ink-muted)]">
              {order.order_number}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-3 px-3 pt-3.5">
        {/* Order ready banner - prominent notification */}
        {showReadyBanner && (
          <div
            className="relative text-white rounded-xl px-4 py-4 flex items-center gap-3 animate-pulse-once"
            style={{ backgroundColor: '#1A1A1A' }}
          >
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
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors shrink-0 h-8 w-8 text-white"
              aria-label={t('close')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Notification permission prompt - shown once if not yet decided */}
        {!showReadyBanner &&
          permissionState === 'default' &&
          order.status !== 'ready' &&
          order.status !== 'delivered' && (
            <Button
              variant="ghost"
              onClick={requestPermission}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors h-auto justify-start"
              style={{ backgroundColor: '#F6F6F6', color: '#1A1A1A' }}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t('enableNotifications')}</span>
            </Button>
          )}

        {/* Status + 4-step tracker card */}
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white">
          <div className="px-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] px-2 py-[3px] font-mono text-[10.5px] font-medium uppercase tracking-[0.3px] ${isCancelled ? 'bg-[var(--color-promo)]/10 text-[var(--color-promo)]' : 'bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isCancelled ? 'bg-[var(--color-promo)]' : 'track-pulse bg-[var(--color-brand)]'}`}
                />
                {statusLabel}
              </span>
              <span className="whitespace-nowrap text-[11.5px] text-[var(--color-ink-muted)]">
                {t('orderedAt')} {orderedTime}
              </span>
            </div>
            <div className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.8px] text-[var(--color-ink)]">
              {statusLabel}
            </div>
            {order.table_number && (
              <div className="mt-px text-[12.5px] text-[var(--color-ink-muted)]">
                {t('table')} {order.table_number}
              </div>
            )}
          </div>

          {/* 4-step tracker */}
          <div className="px-4 pb-[18px] pt-[22px]">
            <div className="relative flex justify-between">
              <div className="absolute left-4 right-4 top-[14px] h-0.5 bg-[var(--color-divider)]" />
              <div
                className="absolute left-4 top-[14px] h-0.5 bg-[var(--color-brand)]"
                style={{
                  width: `calc(${(stepIdx / (steps.length - 1)) * 100}% - 32px * ${stepIdx / (steps.length - 1)})`,
                }}
              />
              {steps.map((s, i) => {
                const done = i < stepIdx;
                const active = i === stepIdx;
                const Ico = s.Icon;
                return (
                  <div
                    key={i}
                    className="relative z-[1] flex flex-1 flex-col items-center gap-[7px]"
                  >
                    <div
                      className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] ${
                        done || active
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand)]'
                          : 'border-[var(--color-ink-soft)] bg-white'
                      }`}
                    >
                      {done ? (
                        <Check className="h-[13px] w-[13px] text-white" strokeWidth={2.6} />
                      ) : (
                        <Ico
                          className={`h-[13px] w-[13px] ${active ? 'text-white' : 'text-[var(--color-ink-soft)]'}`}
                          strokeWidth={2}
                        />
                      )}
                    </div>
                    <span
                      className={`text-center text-[10.5px] tracking-[-0.1px] ${
                        done || active
                          ? 'font-semibold text-[var(--color-ink)]'
                          : 'font-medium text-[var(--color-ink-muted)]'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-[var(--color-divider)] px-4">
            {(order.items || []).map((item, idx) => {
              const hasImg = item.image_url && !item.image_url.includes('placeholder');
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 border-b border-[var(--color-divider)] py-3 last:border-b-0"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-tag)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] text-[11px] font-semibold tabular-nums text-[var(--color-ink-2)]">
                    {item.quantity}
                  </span>
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-tag)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
                    {hasImg ? (
                      <Image
                        src={item.image_url!}
                        alt={item.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Utensils className="h-4 w-4 text-[var(--color-ink-soft)]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.2px] text-[var(--color-ink)]">
                    {item.name}
                  </div>
                  <PriceStacked
                    value={formatDisplayPrice(item.price * item.quantity)}
                    numClass="text-[14px] font-bold text-[var(--color-ink)]"
                  />
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between border-t border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-4 py-3">
            <span className="text-[13px] font-semibold text-[var(--color-ink)]">{t('total')}</span>
            <PriceStacked
              value={formatDisplayPrice(order.total + order.tip_amount)}
              numClass="text-[16px] font-bold text-[var(--color-ink)]"
            />
          </div>
        </section>

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

        {/* Back to menu */}
        <Button
          asChild
          variant="outline"
          className="h-12 w-full gap-2 rounded-full border-[var(--color-divider)] bg-white text-[14px] font-semibold text-[var(--color-ink)]"
        >
          <Link href={menuPath}>
            <ArrowLeft className="h-4 w-4" />
            {t('backToMenu')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

// --- Page export with Suspense ---------------------------
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
