'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import { STATUS_STYLES } from '@/lib/design-tokens';
import type { OrderStatus } from '@/lib/design-tokens';
import Link from 'next/link';
import { ChevronRight, Clock, ShoppingBag, QrCode, BarChart3, Package } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// Lazy-load recharts for faster initial paint
const DashboardChart = lazy(() =>
  import('recharts').then((mod) => ({
    default: function DashboardChartInner({
      revenueData,
      ordersData,
      fmtF,
      mode,
      revenueLabel,
      ordersLabel,
    }: {
      revenueData: Array<{ label: string; value: number }>;
      ordersData: Array<{ label: string; value: number }>;
      fmtF: (n: number) => string;
      mode: 'revenue' | 'orders';
      revenueLabel: string;
      ordersLabel: string;
    }) {
      const { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } = mod;
      const data = mode === 'revenue' ? revenueData : ordersData;
      const gradId = mode === 'revenue' ? 'rev-grad' : 'ord-grad';
      const label = mode === 'revenue' ? revenueLabel : ordersLabel;
      const fmt = mode === 'revenue' ? fmtF : (n: number) => String(n);
      // Filled Line Chart: green #4ade80, linear segments, subtle gradient fill
      const strokeColor = '#4ade80';

      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
              dy={4}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: 'var(--app-text-muted)' }}
              width={40}
              tickFormatter={(v) =>
                mode === 'revenue'
                  ? v >= 1000
                    ? `${Math.round(v / 1000)}k`
                    : String(v)
                  : String(v)
              }
            />
            <Tooltip
              contentStyle={
                {
                  backgroundColor: 'var(--app-card)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                } as CSSProperties
              }
              formatter={(value) => [fmt(Number(value ?? 0)), label]}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke={strokeColor}
              fill={`url(#${gradId})`}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: strokeColor, stroke: 'var(--app-card)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    },
  })),
);

// Semi-circular gauge chart for stats overview
const StatsGauge = lazy(() =>
  import('recharts').then((mod) => ({
    default: function StatsGaugeInner({
      data,
    }: {
      data: Array<{ name: string; value: number; displayValue: string; color: string }>;
    }) {
      const { PieChart, Pie, Cell, ResponsiveContainer } = mod;
      return (
        <div className="relative">
          <ResponsiveContainer width="100%" height={58}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius={30}
                outerRadius={46}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    },
  })),
);

// Avg basket mini chart (separate lazy component)
const AvgBasketChart = lazy(() =>
  import('recharts').then((mod) => ({
    default: function AvgBasketChartInner({
      data,
      fmtF,
      label,
    }: {
      data: Array<{ label: string; value: number }>;
      fmtF: (n: number) => string;
      label: string;
    }) {
      const { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } = mod;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="basket-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-status-info)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-status-info)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: 'var(--app-text-muted)' }}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={
                {
                  backgroundColor: 'var(--app-card)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  padding: '6px 10px',
                } as CSSProperties
              }
              formatter={(value) => [fmtF(Number(value ?? 0)), label]}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="var(--color-status-info)"
              fill="url(#basket-grad)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                fill: 'var(--color-status-info)',
                stroke: 'var(--app-card)',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    },
  })),
);

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
};

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, userName, currency = 'XAF' } = props;

  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const to = useTranslations('orders');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtF = (n: number) => formatCurrency(n, currency as CurrencyCode);

  const { stats, recentOrders, revenueSparkline, ordersSparkline, loading } =
    useDashboardData(props);

  const { can } = usePermissions();
  const showFin = can('canViewAllFinances');

  const [chartMode, setChartMode] = useState<'revenue' | 'orders'>('revenue');

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hour = currentTime.getHours();
  const greetKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  // Stable timestamp for "new order" detection - refreshes when orders change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [recentOrders]);

  // Total revenue over the 7-day period
  const totalRevenue7d = useMemo(
    () => revenueSparkline.reduce((sum, p) => sum + p.value, 0),
    [revenueSparkline],
  );

  // Total orders over the 7-day period
  const totalOrders7d = useMemo(
    () => ordersSparkline.reduce((sum, p) => sum + p.value, 0),
    [ordersSparkline],
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col p-3 sm:p-5 lg:p-6 xl:p-8 2xl:p-10 gap-4 overflow-hidden">
        <div className="h-8 w-48 sm:w-64 rounded-lg bg-app-elevated/30 animate-pulse" />
        <div className="grid grid-cols-2 sm:flex gap-3 sm:gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 sm:w-32 rounded-lg bg-app-elevated/30 animate-pulse" />
          ))}
        </div>
        <div className="flex-1 rounded-lg bg-app-elevated/30 animate-pulse" />
      </div>
    );
  }

  // Build sparkline data with labels
  const chartData =
    revenueSparkline.length > 1
      ? revenueSparkline.map((p, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (revenueSparkline.length - 1 - i));
          return {
            label: d.toLocaleDateString(locale, { weekday: 'short' }),
            value: p.value,
          };
        })
      : [];

  // Build orders sparkline data with labels
  const ordersChartData =
    ordersSparkline.length > 1
      ? ordersSparkline.map((p, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (ordersSparkline.length - 1 - i));
          return {
            label: d.toLocaleDateString(locale, { weekday: 'short' }),
            value: p.value,
          };
        })
      : [];

  // Build avg basket sparkline from revenue / orders per day
  const avgBasketChartData =
    revenueSparkline.length > 1 && ordersSparkline.length > 1
      ? revenueSparkline.map((p, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (revenueSparkline.length - 1 - i));
          const orders = ordersSparkline[i]?.value || 0;
          return {
            label: d.toLocaleDateString(locale, { weekday: 'short' }),
            value: orders > 0 ? Math.round(p.value / orders) : 0,
          };
        })
      : [];

  const todayAvgBasket =
    stats.ordersToday > 0 ? Math.round(stats.revenueToday / stats.ordersToday) : 0;

  return (
    <div className="h-full flex flex-col p-3 sm:p-5 lg:p-6 xl:p-8 2xl:p-10 overflow-hidden">
      {/* Greeting + date + time */}
      <div className="shrink-0 mb-2 flex items-center justify-between flex-wrap gap-1 sm:gap-2">
        <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-app-text">
            {t(greetKey)}, {userName || tenantName}
          </h1>
          <span className="text-[10px] sm:text-xs text-app-text-muted capitalize hidden sm:inline">
            {currentTime.toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>
        <span
          className="text-xs sm:text-sm font-mono font-bold text-app-text tabular-nums flex items-center gap-1 sm:gap-1.5 shrink-0"
          suppressHydrationWarning
        >
          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-app-text-muted" />
          {currentTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* ── Two-column: left (gauge + chart + shortcuts), right (orders from top) ─── */}
      <div className="flex-1 min-h-0 flex flex-col @md:flex-row @lg:flex-row gap-3 overflow-y-auto @lg:overflow-hidden">
        {/* ── Left column ──────────────────────────────────── */}
        <div className="shrink-0 @md:shrink @md:w-[48%] @lg:shrink @lg:w-[50%] flex flex-col gap-2">
          {/* Stats gauge - compact */}
          <div className="border border-app-border rounded-xl px-2 sm:px-3 py-2 bg-app-card">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="shrink-0 w-[80px] sm:w-[110px]">
                <Suspense
                  fallback={
                    <div className="h-[60px] rounded-lg bg-app-elevated/20 animate-pulse" />
                  }
                >
                  <StatsGauge
                    data={[
                      ...(showFin
                        ? [
                            {
                              name: t('revenueToday'),
                              value: Math.max(stats.revenueToday, 1),
                              displayValue: fmtF(stats.revenueToday),
                              color: '#4ade80',
                            },
                          ]
                        : []),
                      {
                        name: t('ordersToday'),
                        value: Math.max(stats.ordersToday, 1),
                        displayValue: String(stats.ordersToday),
                        color: '#60a5fa',
                      },
                      {
                        name: t('activeItems'),
                        value: Math.max(stats.activeItems, 1),
                        displayValue: String(stats.activeItems),
                        color: '#f97316',
                      },
                      {
                        name: t('activeTables'),
                        value: Math.max(stats.activeCards, 1),
                        displayValue: String(stats.activeCards),
                        color: '#a78bfa',
                      },
                    ]}
                  />
                </Suspense>
              </div>
              {/* Legend */}
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-3 gap-y-0.5">
                {[
                  ...(showFin
                    ? [
                        {
                          color: '#4ade80',
                          label: t('revenueToday'),
                          value: fmtF(stats.revenueToday),
                          trend: stats.revenueTrend,
                        },
                      ]
                    : []),
                  {
                    color: '#60a5fa',
                    label: t('ordersToday'),
                    value: String(stats.ordersToday),
                    trend: stats.ordersTrend,
                  },
                  { color: '#f97316', label: t('activeItems'), value: String(stats.activeItems) },
                  { color: '#a78bfa', label: t('activeTables'), value: String(stats.activeCards) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[9px] text-app-text-muted">{item.label}</span>
                    <span className="text-[9px] font-bold text-app-text tabular-nums ml-auto shrink-0">
                      {item.value}
                    </span>
                    {'trend' in item && item.trend !== undefined && item.trend !== 0 && (
                      <span
                        className={cn(
                          'text-[8px] font-bold shrink-0',
                          (item.trend ?? 0) > 0 ? 'text-status-success' : 'text-status-error',
                        )}
                      >
                        {(item.trend ?? 0) > 0 ? '+' : ''}
                        {item.trend}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Main chart - Revenue / Orders toggle (always rendered) */}
          <div className="border border-app-border rounded-xl p-3 sm:p-4 bg-app-card flex flex-col">
            {/* Chart header */}
            <div className="mb-3 shrink-0">
              {/* Segmented control row */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[10px] font-semibold text-app-text-muted uppercase tracking-widest">
                  {chartMode === 'revenue' ? t('dashboardOverview') : t('ordersLabel')}
                </p>
                <div className="flex items-center bg-app-elevated rounded-lg p-0.5 border border-app-border shrink-0">
                  <button
                    onClick={() => setChartMode('revenue')}
                    className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-semibold transition-all whitespace-nowrap',
                      chartMode === 'revenue'
                        ? 'bg-accent text-accent-text shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary',
                    )}
                  >
                    {t('revenueLabel')}
                  </button>
                  <button
                    onClick={() => setChartMode('orders')}
                    className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-semibold transition-all whitespace-nowrap',
                      chartMode === 'orders'
                        ? 'bg-accent text-accent-text shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary',
                    )}
                  >
                    {t('ordersLabel')}
                  </button>
                </div>
              </div>
              {/* Value + period */}
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-lg sm:text-xl font-black text-app-text tabular-nums">
                  {chartMode === 'revenue' ? fmtF(totalRevenue7d) : totalOrders7d}
                </span>
                <span className="text-[10px] text-app-text-muted shrink-0">{t('last7days')}</span>
              </div>
            </div>

            {/* Chart area */}
            <div className="h-[120px] sm:h-[150px]">
              <Suspense
                fallback={
                  <div className="w-full h-full rounded-lg bg-app-elevated/20 animate-pulse" />
                }
              >
                <DashboardChart
                  revenueData={chartData}
                  ordersData={ordersChartData}
                  fmtF={fmtF}
                  mode={chartMode}
                  revenueLabel={t('revenueToday')}
                  ordersLabel={t('ordersToday')}
                />
              </Suspense>
            </div>
          </div>

          {/* Avg basket mini chart (always rendered when user has finance permission) */}
          {showFin && (
            <div className="border border-app-border rounded-xl p-3 sm:p-4 bg-app-card">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-[10px] font-semibold text-app-text-muted uppercase tracking-widest">
                    {t('avgBasket')}
                  </p>
                  <p className="text-[10px] text-app-text-muted">{t('perOrder')}</p>
                </div>
                <span className="text-lg font-black text-app-text tabular-nums">
                  {fmtF(todayAvgBasket)}
                </span>
              </div>
              <div className="h-[70px]">
                <Suspense
                  fallback={
                    <div className="w-full h-full rounded-lg bg-app-elevated/20 animate-pulse" />
                  }
                >
                  <AvgBasketChart data={avgBasketChartData} fmtF={fmtF} label={t('avgBasket')} />
                </Suspense>
              </div>
            </div>
          )}

          {/* Quick actions - QR, Reports, Stock history */}
          <div className="flex gap-1.5 mt-auto">
            <Link
              href={`${adminBase}/qr-codes`}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 border border-app-border rounded-lg text-app-text-secondary text-[11px] font-semibold hover:bg-app-hover transition-colors min-w-0"
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('qrGenerator')}</span>
            </Link>
            <Link
              href={`${adminBase}/reports`}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 border border-app-border rounded-lg text-app-text-secondary text-[11px] font-semibold hover:bg-app-hover transition-colors min-w-0"
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('reportsLabel')}</span>
            </Link>
            <Link
              href={`${adminBase}/stock-history`}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 border border-app-border rounded-lg text-app-text-secondary text-[11px] font-semibold hover:bg-app-hover transition-colors min-w-0"
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('stockHistoryLabel')}</span>
            </Link>
          </div>
        </div>

        {/* ── Right column - orders (full height, scrollable) ── */}
        <div className="flex-1 min-h-[200px] @lg:min-h-0 flex flex-col min-w-0 border border-app-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-app-border shrink-0">
            <p className="text-[10px] font-semibold text-app-text-muted uppercase tracking-widest">
              {t('recentOrders')}
            </p>
            <Link
              href={`${adminBase}/orders`}
              className="text-[10px] font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-0.5"
            >
              {t('viewAll')}
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {recentOrders.length > 0 ? (
            <div className="overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="overflow-y-auto flex-1 scrollbar-hide">
                {recentOrders.slice(0, 15).map((order) => {
                  const sc = STATUS_STYLES[order.status as OrderStatus] || STATUS_STYLES.pending;
                  const statusKey =
                    `status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}Card` as Parameters<
                      typeof to
                    >[0];
                  const orderLabel = order.order_number || `#${order.id.slice(0, 6).toUpperCase()}`;
                  const ageSeconds = Math.floor(
                    (now - new Date(order.created_at).getTime()) / 1000,
                  );
                  const isNew = ageSeconds < 300; // < 5 min
                  return (
                    <Link
                      key={order.id}
                      href={`${adminBase}/orders/${order.id}`}
                      className={cn(
                        'flex items-start gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors',
                        isNew && 'bg-accent/[0.04]',
                      )}
                    >
                      {/* Status dot - glowing ring for new orders */}
                      <div className="relative shrink-0 mt-1">
                        <div className={cn('w-2 h-2 rounded-full', sc.dot)} />
                        {isNew && (
                          <div className="absolute -inset-1 rounded-full border-2 border-accent/40 animate-ping" />
                        )}
                        {!isNew && sc.pulse && (
                          <div
                            className={cn(
                              'absolute inset-0 w-2 h-2 rounded-full animate-ping',
                              sc.dot,
                            )}
                          />
                        )}
                      </div>
                      {/* Order info */}
                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-app-text shrink-0">
                            {order.table_number}
                          </span>
                          <span className="text-[10px] text-app-text-muted">{orderLabel}</span>
                          <span
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                              sc.bg,
                              sc.text,
                            )}
                          >
                            {to(statusKey)}
                          </span>
                          {isNew && (
                            <span className="text-[9px] font-bold text-accent bg-accent-muted px-1.5 py-0.5 rounded-full">
                              NEW
                            </span>
                          )}
                        </div>
                        {order.items && order.items.length > 0 && (
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {order.items.map((item, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] text-app-text-muted leading-tight"
                              >
                                {item.quantity}× {item.name}
                                {idx < (order.items?.length ?? 0) - 1 && (
                                  <span className="text-app-border ml-0.5">·</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Price + tip + time */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-app-text tabular-nums">
                          {fmtF(order.total_price + (order.tip_amount || 0))}
                        </span>
                        {(order.tip_amount ?? 0) > 0 && (
                          <span className="text-[9px] text-emerald-500 font-medium tabular-nums">
                            +{fmtF(order.tip_amount!)} {t('tipLabel')}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 text-[10px] text-app-text-muted">
                          <Clock className="w-2.5 h-2.5" />
                          {timeAgo(order.created_at, tc, locale)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-10 text-center flex-1 flex flex-col items-center justify-center">
              <div className="w-10 h-10 bg-app-elevated rounded-xl flex items-center justify-center mx-auto mb-2">
                <ShoppingBag className="w-5 h-5 text-app-text-muted" />
              </div>
              <p className="text-sm font-bold text-app-text">{t('noOrdersDescAlt')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
