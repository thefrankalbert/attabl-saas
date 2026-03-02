'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact, formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode, PopularItem } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import AdminHomeGrid from '@/components/admin/AdminHomeGrid';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Clock,
  ShoppingBag,
  Package,
  Zap,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
};

// ─── Animated counter ───────────────────────────────────

function useAnimatedCount(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let raf: number;
    if (target === 0) {
      raf = requestAnimationFrame(() => setCount(0));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

// ─── Status config ──────────────────────────────────────

const STATUS_CFG: Record<string, { bg: string; text: string; dot: string; pulse: boolean }> = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400', pulse: true },
  preparing: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
    pulse: true,
  },
  ready: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    pulse: false,
  },
  delivered: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-500', pulse: false },
  cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500', pulse: false },
};

// ─── CSS Animations ─────────────────────────────────────

const ANIMATIONS_CSS = `
@keyframes dash-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dash-scale-in {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes dash-bar-grow {
  from { width: 0%; }
}
@keyframes dash-gradient-drift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
@keyframes dash-float {
  0%, 100% { transform: translateY(0px); }
  50%      { transform: translateY(-5px); }
}
@keyframes dash-pulse-ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.8); opacity: 0; }
}
.dash-up   { animation: dash-fade-up  0.6s cubic-bezier(0.22,1,0.36,1) both; }
.dash-pop  { animation: dash-scale-in 0.5s cubic-bezier(0.22,1,0.36,1) both; }
`;

// ─── Dashboard ──────────────────────────────────────────

export default function DashboardClient(props: DashboardClientProps) {
  const {
    tenantSlug,
    tenantName,
    currency = 'XAF',
    establishmentType,
    initialPopularItems = [],
  } = props;

  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtC = (n: number) => formatCurrencyCompact(n, currency as CurrencyCode);
  const fmtF = (n: number) => formatCurrency(n, currency as CurrencyCode);

  const { stats, recentOrders, categoryBreakdown, revenueSparkline, ordersSparkline, loading } =
    useDashboardData(props);

  const { can } = usePermissions();
  const showFin = can('canViewAllFinances');

  const animRevenue = useAnimatedCount(stats.revenueToday, 1200);
  const animOrders = useAnimatedCount(stats.ordersToday, 800);
  const animItems = useAnimatedCount(stats.activeItems, 700);

  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
  const pendingCount = recentOrders.filter((o) => o.status === 'pending').length;

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ─── Loading skeleton ──────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex flex-col p-3 sm:p-4 gap-2.5 overflow-hidden">
        <div className="shrink-0 h-[120px] md:h-[100px] rounded-2xl bg-app-elevated/40 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[56px] rounded-xl bg-app-elevated/30 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2.5 min-h-0">
          <div className="md:col-span-3 rounded-xl bg-app-elevated/30 animate-pulse" />
          <div className="md:col-span-2 rounded-xl bg-app-elevated/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <>
      <style>{ANIMATIONS_CSS}</style>

      {/* ────────────────────────────────────────────────────
          LAYOUT:
          Mobile  → flex col, scrollable
          Tablet+ → CSS grid 4 rows (auto auto 1fr 1fr), NO scroll
          ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          'h-full p-3 sm:p-4',
          // Mobile: vertical scroll
          'flex flex-col gap-2 overflow-y-auto scrollbar-hide',
          // Tablet+: CSS grid, NO scroll — 2fr for content, 3fr for quick access
          'md:grid md:grid-rows-[auto_auto_2fr_3fr] md:gap-2 md:overflow-y-hidden',
          // Fade in
          ready ? 'opacity-100' : 'opacity-0',
          'transition-opacity duration-500',
        )}
      >
        {/* ━━━ ROW 1: HERO BANNER ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div
          className="relative rounded-2xl overflow-hidden dash-up"
          style={{
            background:
              'linear-gradient(135deg, var(--app-accent) 0%, color-mix(in oklch, var(--app-accent), #000 35%) 45%, color-mix(in oklch, var(--app-accent), #1a0a3e 70%) 100%)',
            backgroundSize: '200% 200%',
            animation:
              'dash-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both, dash-gradient-drift 12s ease infinite',
          }}
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          />
          {/* Radial highlight */}
          <div
            className="absolute top-0 right-0 w-3/5 h-full opacity-[0.12]"
            style={{
              background: 'radial-gradient(ellipse at 75% 25%, white 0%, transparent 55%)',
            }}
          />

          <div className="relative z-10 px-4 py-2.5 sm:px-5 sm:py-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold text-white/90 tracking-tight truncate">
                  {t(greetKey)}, {tenantName}
                </h1>
                <p className="text-[10px] text-white/35 mt-0.5 capitalize font-medium">
                  {new Date().toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                {showFin && (
                  <div className="mt-2 sm:mt-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tighter leading-none">
                        {fmtC(animRevenue)}
                      </span>
                      {stats.revenueTrend !== undefined && stats.revenueTrend !== 0 && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm',
                            stats.revenueTrend > 0
                              ? 'bg-white/15 text-emerald-200'
                              : 'bg-white/15 text-red-200',
                          )}
                        >
                          {stats.revenueTrend > 0 ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {stats.revenueTrend > 0 ? '+' : ''}
                          {stats.revenueTrend}%
                        </span>
                      )}
                    </div>
                    <p className="text-[8px] text-white/30 mt-0.5 uppercase tracking-[0.15em] font-bold">
                      {t('revenueToday')}
                    </p>
                  </div>
                )}
              </div>

              {/* Sparkline — hidden on small mobile */}
              {revenueSparkline.length > 1 && (
                <div className="hidden sm:block w-[160px] h-[38px] shrink-0 opacity-50">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueSparkline}
                      margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="rgba(255,255,255,0.55)"
                        fill="url(#hero-spark)"
                        strokeWidth={1.5}
                        dot={false}
                        animationDuration={1800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {pendingCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.08] backdrop-blur-sm">
                <div className="relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                  <div
                    className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-amber-300"
                    style={{ animation: 'dash-pulse-ring 1.5s ease-out infinite' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-white/75">
                  {t('pendingCount', { count: pendingCount })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ━━━ ROW 2: KPI STRIP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(
            [
              {
                label: t('ordersToday'),
                value: animOrders.toString(),
                trend: stats.ordersTrend,
                color: 'from-accent/20 via-accent/10 to-transparent border-accent/15',
                show: true,
              },
              {
                label: t('activeItems'),
                value: animItems.toString(),
                trend: undefined,
                color: 'from-blue-500/20 via-blue-500/10 to-transparent border-blue-500/15',
                show: true,
              },
              {
                label: t('activeTables'),
                value: stats.activeCards.toString(),
                trend: undefined,
                color: 'from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/15',
                show: true,
              },
              {
                label: t('avgBasket'),
                value:
                  stats.ordersToday > 0
                    ? fmtC(Math.round(stats.revenueToday / stats.ordersToday))
                    : '—',
                trend: undefined,
                color: 'from-violet-500/20 via-violet-500/10 to-transparent border-violet-500/15',
                show: showFin,
              },
            ] as const
          )
            .filter((k) => k.show)
            .map((kpi, i) => (
              <div
                key={kpi.label}
                className={cn(
                  'rounded-xl border bg-gradient-to-br p-2.5 sm:p-3 dash-pop',
                  'hover:brightness-110 transition-all duration-200',
                  kpi.color,
                )}
                style={{ animationDelay: `${150 + i * 80}ms` }}
              >
                <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.1em] text-app-text-muted font-semibold leading-tight">
                  {kpi.label}
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-lg sm:text-xl font-black text-app-text tabular-nums tracking-tight leading-none">
                    {kpi.value}
                  </span>
                  {kpi.trend !== undefined && kpi.trend !== 0 && (
                    <span
                      className={cn(
                        'text-[8px] font-bold',
                        kpi.trend > 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {kpi.trend > 0 ? '+' : ''}
                      {kpi.trend}%
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* ━━━ ROW 3: OVERVIEW + RECENT ORDERS ━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:min-h-0">
          {/* Revenue Overview (3/5) */}
          <div
            className={cn(
              'md:col-span-3 rounded-xl border border-app-border bg-app-card dash-up',
              'p-3 sm:p-4 md:flex md:flex-col md:overflow-hidden',
            )}
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h2 className="text-[10px] font-bold text-app-text-muted uppercase tracking-[0.12em]">
                {t('dashboardOverview')}
              </h2>
              {ordersSparkline.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] text-accent font-semibold">
                  <Zap className="w-2.5 h-2.5" />
                  Live
                </span>
              )}
            </div>

            {/* Chart — flexible on md+ */}
            <div className="flex-1 min-h-[60px] md:min-h-0 -mx-1 mb-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={
                    revenueSparkline.length > 1
                      ? revenueSparkline
                      : [
                          { label: '0', value: 0 },
                          { label: '1', value: 0 },
                        ]
                  }
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="overview-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--app-accent)"
                    fill="url(#overview-area)"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={1800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* CTA row */}
            <div className="flex gap-2 shrink-0">
              <Link
                href={`${adminBase}/orders`}
                className="flex-1 text-center px-3 py-2 rounded-xl bg-accent text-accent-text text-xs font-bold hover:brightness-110 active:scale-[0.97] transition-all touch-manipulation"
              >
                {t('viewOrders')}
              </Link>
              <Link
                href={`${adminBase}/pos`}
                className="flex-1 text-center px-3 py-2 rounded-xl border border-app-border bg-app-elevated text-app-text text-xs font-bold hover:bg-app-hover active:scale-[0.97] transition-all touch-manipulation"
              >
                {t('openPos')}
              </Link>
            </div>
          </div>

          {/* Recent Orders (2/5) */}
          <div
            className={cn(
              'md:col-span-2 rounded-xl border border-app-border bg-app-card dash-up',
              'p-3 sm:p-4 md:flex md:flex-col md:overflow-hidden',
            )}
            style={{ animationDelay: '400ms' }}
          >
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-[10px] font-bold text-app-text-muted uppercase tracking-[0.12em]">
                {t('recentOrders')}
              </h2>
              <Link
                href={`${adminBase}/orders`}
                className="text-[9px] font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-0.5"
              >
                {t('viewAll')}
                <ChevronRight className="w-2.5 h-2.5" />
              </Link>
            </div>

            {/* Scrollable order list on md+ */}
            <div className="flex-1 min-h-0 md:overflow-y-auto md:scrollbar-hide space-y-1">
              {recentOrders.length > 0 ? (
                recentOrders.slice(0, 6).map((order, idx) => {
                  const sc = STATUS_CFG[order.status] || STATUS_CFG.pending;
                  return (
                    <Link
                      key={order.id}
                      href={`${adminBase}/orders/${order.id}`}
                      className="group flex items-center gap-2 p-2 rounded-lg hover:bg-app-elevated/50 transition-all dash-up touch-manipulation"
                      style={{ animationDelay: `${500 + idx * 60}ms` }}
                    >
                      <div className="relative shrink-0">
                        <div className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                        {sc.pulse && (
                          <div
                            className={cn('absolute inset-0 w-1.5 h-1.5 rounded-full', sc.dot)}
                            style={{ animation: 'dash-pulse-ring 1.8s ease-out infinite' }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-app-text">
                            {order.table_number}
                          </span>
                          <span
                            className={cn(
                              'text-[7px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
                              sc.bg,
                              sc.text,
                            )}
                          >
                            {order.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-2 h-2 text-app-text-muted" />
                          <span className="text-[9px] text-app-text-muted">
                            {timeAgo(order.created_at, t, locale)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-app-text tabular-nums shrink-0">
                        {fmtF(order.total_price)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-4">
                  <div style={{ animation: 'dash-float 3s ease-in-out infinite' }}>
                    <ShoppingBag className="w-7 h-7 text-app-text-muted/25 mb-1.5" />
                  </div>
                  <p className="text-[11px] text-app-text-muted">{t('noOrdersDescAlt')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ━━━ ROW 4: QUICK ACCESS ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex flex-col md:min-h-0 dash-up" style={{ animationDelay: '500ms' }}>
          <h2 className="shrink-0 text-[10px] font-bold text-app-text-muted uppercase tracking-[0.12em] mb-2">
            {t('quickAccessTitle')}
          </h2>
          <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
        </div>

        {/* ━━━ MOBILE ONLY: Popular Items ━━━━━━━━━━━━━━━━━━━ */}
        {initialPopularItems.length > 0 && (
          <div
            className="md:hidden rounded-xl border border-app-border bg-app-card p-3 dash-up"
            style={{ animationDelay: '600ms' }}
          >
            <h2 className="text-[10px] font-bold text-app-text-muted uppercase tracking-[0.12em] mb-2.5">
              {t('topDishes')}
            </h2>
            <div className="space-y-0.5">
              {initialPopularItems.slice(0, 5).map((item: PopularItem, i: number) => {
                const maxCount = initialPopularItems[0]?.order_count || 1;
                const pct = Math.min(100, (item.order_count / maxCount) * 100);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-app-elevated/40 transition-colors dash-up"
                    style={{ animationDelay: `${700 + i * 60}ms` }}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0',
                        i === 0 && 'bg-accent/20 text-accent',
                        i === 1 && 'bg-amber-500/15 text-amber-400',
                        i === 2 && 'bg-orange-500/15 text-orange-400',
                        i > 2 && 'bg-app-elevated text-app-text-muted',
                      )}
                    >
                      {i + 1}
                    </span>
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt=""
                        width={28}
                        height={28}
                        className="w-7 h-7 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-app-elevated shrink-0 flex items-center justify-center">
                        <Package className="w-3 h-3 text-app-text-muted" />
                      </div>
                    )}
                    <span className="flex-1 text-xs font-medium text-app-text truncate">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-12 h-1.5 rounded-full bg-app-elevated overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{
                            width: `${pct}%`,
                            animation: `dash-bar-grow 0.7s cubic-bezier(0.22,1,0.36,1) ${0.8 + i * 0.1}s both`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-app-text tabular-nums min-w-[2rem] text-right">
                        {item.order_count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ━━━ MOBILE ONLY: Categories ━━━━━━━━━━━━━━━━━━━━━ */}
        {categoryBreakdown.length > 0 && (
          <div
            className="md:hidden rounded-xl border border-app-border bg-app-card p-3 dash-up"
            style={{ animationDelay: '800ms' }}
          >
            <h2 className="text-[10px] font-bold text-app-text-muted uppercase tracking-[0.12em] mb-2.5">
              {t('popularCategories')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {categoryBreakdown.map((cat, i) => {
                const palettes = [
                  'from-emerald-500/15 to-emerald-500/5 border-emerald-500/20',
                  'from-amber-500/15 to-amber-500/5 border-amber-500/20',
                  'from-blue-500/15 to-blue-500/5 border-blue-500/20',
                  'from-violet-500/15 to-violet-500/5 border-violet-500/20',
                ];
                return (
                  <div
                    key={cat.name}
                    className={cn(
                      'rounded-xl border bg-gradient-to-br p-3 dash-pop',
                      palettes[i % palettes.length],
                    )}
                    style={{ animationDelay: `${850 + i * 60}ms` }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-app-text-muted">
                      {cat.name}
                    </p>
                    <p className="text-lg font-black text-app-text mt-1 tabular-nums tracking-tight">
                      {fmtC(cat.value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
