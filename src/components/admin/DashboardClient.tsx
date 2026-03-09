'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact, formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import { STATUS_STYLES } from '@/lib/design-tokens';
import type { OrderStatus } from '@/lib/design-tokens';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronRight, Clock, ShoppingBag, Zap } from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
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

// ─── CSS Animations ─────────────────────────────────────

const ANIMATIONS_CSS = `
@keyframes dash-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.dash-up { animation: dash-fade-up 0.5s ease both; }
`;

// ─── Dashboard ──────────────────────────────────────────

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF' } = props;

  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtC = (n: number) => formatCurrencyCompact(n, currency as CurrencyCode);
  const fmtF = (n: number) => formatCurrency(n, currency as CurrencyCode);

  const { stats, recentOrders, revenueSparkline, ordersSparkline, itemsSparkline, loading } =
    useDashboardData(props);

  const { can } = usePermissions();
  const showFin = can('canViewAllFinances');

  const animRevenue = useAnimatedCount(stats.revenueToday, 1200);
  const animOrders = useAnimatedCount(stats.ordersToday, 800);
  const animItems = useAnimatedCount(stats.activeItems, 700);

  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  // ─── Loading skeleton ──────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-3 sm:gap-4 overflow-hidden">
        <div className="shrink-0 h-[52px] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[80px] rounded-2xl bg-app-elevated/30 animate-pulse" />
          ))}
        </div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4 min-h-0">
          <div className="md:col-span-3 rounded-2xl bg-app-elevated/30 animate-pulse" />
          <div className="md:col-span-2 rounded-2xl bg-app-elevated/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <>
      <style>{ANIMATIONS_CSS}</style>

      <div
        className={cn(
          'h-full p-4 sm:p-5 lg:p-6',
          'flex flex-col gap-3 sm:gap-4 overflow-y-auto scrollbar-hide',
          'md:grid md:grid-rows-[auto_auto_1fr] md:gap-4 md:overflow-y-hidden',
        )}
      >
        {/* ━━━ GREETING ━━━ */}
        <div className="dash-up">
          <h1 className="text-lg sm:text-xl font-bold text-app-text tracking-tight">
            {t(greetKey)}, {tenantName}
          </h1>
          <p className="text-sm text-app-text-muted mt-0.5 capitalize">
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* ━━━ ROW 2: KPI STRIP with sparklines ━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {(
            [
              {
                label: t('revenueToday'),
                value: fmtC(animRevenue),
                trend: stats.revenueTrend,
                sparkline: revenueSparkline,
                color: 'var(--app-accent)',
                show: showFin,
              },
              {
                label: t('ordersToday'),
                value: animOrders.toString(),
                trend: stats.ordersTrend,
                sparkline: ordersSparkline,
                color: 'oklch(0.65 0.15 250)',
                show: true,
              },
              {
                label: t('activeItems'),
                value: animItems.toString(),
                trend: undefined,
                sparkline: itemsSparkline,
                color: 'oklch(0.65 0.12 170)',
                show: true,
              },
              {
                label: t('activeTables'),
                value: stats.activeCards.toString(),
                trend: undefined,
                sparkline: [],
                color: 'oklch(0.65 0.12 300)',
                show: true,
              },
              {
                label: t('avgBasket'),
                value:
                  stats.ordersToday > 0
                    ? fmtC(Math.round(stats.revenueToday / stats.ordersToday))
                    : '—',
                trend: undefined,
                sparkline: [],
                color: 'oklch(0.65 0.12 50)',
                show: showFin,
              },
            ] as const
          )
            .filter((k) => k.show)
            .map((kpi) => {
              // Compute average for reference line (dashed baseline)
              const avg =
                kpi.sparkline.length > 1
                  ? kpi.sparkline.reduce((s, p) => s + p.value, 0) / kpi.sparkline.length
                  : 0;

              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl bg-app-card p-4 sm:p-5 dash-up flex flex-col justify-between min-h-[120px]"
                >
                  {/* Top row: label + sparkline */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-app-text-muted font-medium flex items-center gap-1">
                      {kpi.label}
                      <ChevronRight className="w-3 h-3" />
                    </p>
                    {/* Micro sparkline — thin line, top-right like reference */}
                    {kpi.sparkline.length > 1 && (
                      <div className="w-[55%] h-[36px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={kpi.sparkline}
                            margin={{ top: 4, right: 2, left: 2, bottom: 4 }}
                          >
                            <ReferenceLine
                              y={avg}
                              stroke={kpi.color}
                              strokeDasharray="3 3"
                              strokeOpacity={0.3}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={kpi.color}
                              strokeWidth={1.5}
                              dot={false}
                              animationDuration={1200}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Bottom: big value + trend */}
                  <div className="flex items-baseline gap-2 mt-auto pt-2">
                    <span className="text-2xl sm:text-3xl font-black text-app-text tabular-nums tracking-tight leading-none">
                      {kpi.value}
                    </span>
                    {kpi.trend !== undefined && kpi.trend !== 0 && (
                      <span
                        className={cn(
                          'text-xs font-bold flex items-center gap-0.5',
                          kpi.trend > 0 ? 'text-status-success' : 'text-status-error',
                        )}
                      >
                        {kpi.trend > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {kpi.trend > 0 ? '+' : ''}
                        {kpi.trend}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* ━━━ ROW 3: OVERVIEW + RECENT ORDERS ━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4 md:min-h-0">
          {/* Revenue Overview (3/5) */}
          <div className="md:col-span-3 rounded-2xl bg-app-card p-4 sm:p-5 md:flex md:flex-col md:overflow-hidden dash-up">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-widest">
                {t('dashboardOverview')}
              </h2>
              {ordersSparkline.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-accent font-semibold">
                  <Zap className="w-3 h-3" />
                  Live
                </span>
              )}
            </div>

            {/* Chart */}
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'oklch(0.10 0.005 260)',
                      border: 'none',
                      borderRadius: '0.75rem',
                      fontSize: '0.8rem',
                      padding: '8px 12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    }}
                    labelStyle={{ color: 'oklch(0.45 0 0)' }}
                    itemStyle={{ color: 'oklch(0.93 0 0)' }}
                  />
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
            <div className="flex gap-3 shrink-0">
              <Link
                href={`${adminBase}/orders`}
                className="flex-1 text-center px-4 py-2.5 rounded-xl bg-accent text-accent-text text-sm font-semibold hover:opacity-90 transition-opacity touch-manipulation"
              >
                {t('viewOrders')}
              </Link>
              <Link
                href={`${adminBase}/pos`}
                className="flex-1 text-center px-4 py-2.5 rounded-xl bg-app-elevated text-app-text-secondary text-sm font-semibold hover:bg-app-hover transition-colors touch-manipulation"
              >
                {t('openPos')}
              </Link>
            </div>
          </div>

          {/* Recent Orders (2/5) */}
          <div className="md:col-span-2 rounded-2xl bg-app-card p-4 sm:p-5 md:flex md:flex-col md:overflow-hidden dash-up">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-widest">
                {t('recentOrders')}
              </h2>
              <Link
                href={`${adminBase}/orders`}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-0.5"
              >
                {t('viewAll')}
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Order list */}
            <div className="flex-1 min-h-0 md:overflow-y-auto md:scrollbar-hide space-y-1">
              {recentOrders.length > 0 ? (
                recentOrders.slice(0, 6).map((order) => {
                  const sc = STATUS_STYLES[order.status as OrderStatus] || STATUS_STYLES.pending;
                  return (
                    <Link
                      key={order.id}
                      href={`${adminBase}/orders/${order.id}`}
                      className="group flex items-center gap-2 p-2.5 rounded-xl hover:bg-app-elevated/50 transition-all touch-manipulation"
                    >
                      <div className="relative shrink-0">
                        <div className={cn('w-2 h-2 rounded-full', sc.dot)} />
                        {sc.pulse && (
                          <div
                            className={cn(
                              'absolute inset-0 w-2 h-2 rounded-full animate-ping',
                              sc.dot,
                            )}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-app-text">
                            {order.table_number}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
                              sc.bg,
                              sc.text,
                            )}
                          >
                            {order.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5 text-app-text-muted" />
                          <span className="text-xs text-app-text-muted">
                            {timeAgo(order.created_at, t, locale)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-app-text tabular-nums shrink-0">
                        {fmtF(order.total_price)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <ShoppingBag className="w-10 h-10 text-app-text-muted/40 mb-3" />
                  <p className="text-sm font-medium text-app-text-secondary">
                    {t('noOrdersDescAlt')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
