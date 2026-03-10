'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import { STATUS_STYLES } from '@/lib/design-tokens';
import type { OrderStatus } from '@/lib/design-tokens';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Clock,
  ShoppingBag,
  QrCode,
  UtensilsCrossed,
  BarChart3,
} from 'lucide-react';
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

// ─── Africa Presence Map ──────────────────────────────────
// Simplified SVG hex-dot map showing ATTABL deployment countries
const PRESENCE_COUNTRIES = [
  { name: 'Cameroun', cx: 108, cy: 102, color: '#4ade80' },
  { name: 'Tchad', cx: 118, cy: 78, color: '#60a5fa' },
  { name: 'Burkina Faso', cx: 72, cy: 86, color: '#f97316' },
] as const;

function AfricaPresenceMapBg() {
  return (
    <>
      {/* Large faded Africa hex map — centered background watermark */}
      <svg
        viewBox="0 0 200 200"
        className="absolute top-1/2 left-[25%] -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] pointer-events-none select-none opacity-60"
        aria-hidden="true"
      >
        {AFRICA_HEX_GRID.map((hex, i) => (
          <polygon
            key={i}
            points={hexPoints(hex.x, hex.y, 5)}
            fill="var(--app-border)"
            opacity={0.18}
          />
        ))}
        {PRESENCE_COUNTRIES.map((c) => (
          <g key={c.name}>
            <circle cx={c.cx} cy={c.cy} r={12} fill={c.color} opacity={0.1} />
            <circle cx={c.cx} cy={c.cy} r={6} fill={c.color} opacity={0.2} />
            <circle cx={c.cx} cy={c.cy} r={3} fill={c.color} opacity={0.5} />
          </g>
        ))}
      </svg>
      {/* Legend — below the map, centered on left column */}
      <div className="absolute bottom-4 left-[25%] -translate-x-1/2 flex items-center gap-3 pointer-events-none select-none">
        {PRESENCE_COUNTRIES.map((c) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-[10px] font-medium text-app-text-muted/40">{c.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Generate hex polygon points string
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

// Pre-computed hex positions forming Africa's silhouette
const AFRICA_HEX_GRID = (() => {
  // Approximate Africa shape as hex grid coordinates
  // Each row: [startCol, endCol] at a given row index
  const rows: Array<[number, number, number]> = [
    // [row, colStart, colEnd] — rough Africa outline
    [4, 7, 12],
    [5, 6, 13],
    [6, 5, 14],
    [7, 5, 14],
    [8, 4, 14],
    [9, 4, 14],
    [10, 5, 13],
    [11, 5, 13],
    [12, 6, 13],
    [13, 7, 13],
    [14, 7, 12],
    [15, 8, 12],
    [16, 8, 12],
    [17, 9, 12],
    [18, 9, 11],
    [19, 10, 11],
    [20, 10, 11],
  ];
  const hexes: Array<{ x: number; y: number }> = [];
  const spacing = 11;
  for (const [row, colStart, colEnd] of rows) {
    const offsetX = row % 2 === 0 ? 0 : spacing / 2;
    for (let col = colStart; col <= colEnd; col++) {
      hexes.push({
        x: col * spacing + offsetX,
        y: row * (spacing * 0.866),
      });
    }
  }
  return hexes;
})();

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

  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  // Stable timestamp for "new order" detection — refreshes when orders change
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
      <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-hidden">
        <div className="h-8 w-64 rounded-lg bg-app-elevated/30 animate-pulse" />
        <div className="flex gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-32 rounded-lg bg-app-elevated/30 animate-pulse" />
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
    <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 overflow-hidden relative">
      {/* Africa hex map — faded background watermark */}
      <AfricaPresenceMapBg />

      {/* Greeting + date */}
      <div className="shrink-0 mb-2 relative z-10">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-lg font-bold text-app-text">
            {t(greetKey)}, {userName || tenantName}
          </h1>
          <span className="text-xs text-app-text-muted capitalize">
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>
      </div>

      {/* Stats row — plain numbers, no cards */}
      <div className="shrink-0 flex flex-wrap gap-x-8 gap-y-3 mb-3 relative z-10">
        {showFin && (
          <div>
            <p className="text-xs text-app-text-muted">{t('revenueToday')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-app-text tabular-nums">
                {fmtF(stats.revenueToday)}
              </span>
              {stats.revenueTrend !== undefined && stats.revenueTrend !== 0 && (
                <span
                  className={cn(
                    'text-xs font-bold flex items-center gap-0.5',
                    stats.revenueTrend > 0 ? 'text-status-success' : 'text-status-error',
                  )}
                >
                  {stats.revenueTrend > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {stats.revenueTrend > 0 ? '+' : ''}
                  {stats.revenueTrend}%
                </span>
              )}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-app-text-muted">{t('ordersToday')}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-app-text tabular-nums">
              {stats.ordersToday}
            </span>
            {stats.ordersTrend !== undefined && stats.ordersTrend !== 0 && (
              <span
                className={cn(
                  'text-xs font-bold flex items-center gap-0.5',
                  stats.ordersTrend > 0 ? 'text-status-success' : 'text-status-error',
                )}
              >
                {stats.ordersTrend > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {stats.ordersTrend > 0 ? '+' : ''}
                {stats.ordersTrend}%
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-app-text-muted">{t('activeItems')}</p>
          <span className="text-2xl font-black text-app-text tabular-nums">
            {stats.activeItems}
          </span>
        </div>
        <div>
          <p className="text-xs text-app-text-muted">{t('activeTables')}</p>
          <span className="text-2xl font-black text-app-text tabular-nums">
            {stats.activeCards}
          </span>
        </div>
      </div>

      {/* ── Two-column: left (chart + shortcuts), right (orders) ─── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 relative z-10">
        {/* ── Left column ──────────────────────────────────── */}
        <div className="shrink-0 lg:w-[50%] flex flex-col gap-3">
          {/* Main chart — Revenue / Orders toggle */}
          {chartData.length > 1 && (
            <div className="border border-app-border rounded-xl p-4 bg-app-card flex flex-col">
              {/* Chart header */}
              <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-app-text-muted uppercase tracking-widest whitespace-nowrap">
                      {chartMode === 'revenue' ? t('dashboardOverview') : t('ordersToday')}
                    </p>
                    <span className="text-[10px] text-app-text-muted whitespace-nowrap">
                      — {t('last7days')}
                    </span>
                  </div>
                  <span className="text-xl font-black text-app-text tabular-nums mt-0.5 block">
                    {chartMode === 'revenue' ? fmtF(totalRevenue7d) : totalOrders7d}
                  </span>
                </div>

                {/* Segmented control */}
                <div className="flex items-center bg-app-elevated rounded-lg p-0.5 border border-app-border shrink-0">
                  <button
                    onClick={() => setChartMode('revenue')}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all whitespace-nowrap',
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
                      'px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all whitespace-nowrap',
                      chartMode === 'orders'
                        ? 'bg-accent text-accent-text shadow-sm'
                        : 'text-app-text-muted hover:text-app-text-secondary',
                    )}
                  >
                    {t('ordersLabel')}
                  </button>
                </div>
              </div>

              {/* Chart area */}
              <div className="h-[150px]">
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
          )}

          {/* Avg basket mini chart */}
          {showFin && avgBasketChartData.length > 1 && (
            <div className="border border-app-border rounded-xl p-4 bg-app-card">
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

          {/* Quick actions */}
          <div className="flex gap-2 mt-auto">
            <Link
              href={`${adminBase}/menus`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-app-border rounded-xl text-app-text-secondary text-xs font-semibold hover:bg-app-hover transition-colors"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              {t('menusMgmt')}
            </Link>
            <Link
              href={`${adminBase}/qr-codes`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-app-border rounded-xl text-app-text-secondary text-xs font-semibold hover:bg-app-hover transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              {t('qrGenerator')}
            </Link>
            <Link
              href={`${adminBase}/reports`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border border-app-border rounded-xl text-app-text-secondary text-xs font-semibold hover:bg-app-hover transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t('reportsLabel')}
            </Link>
          </div>
        </div>

        {/* ── Right column — orders (full height, scrollable) ── */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0 border border-app-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-app-border shrink-0">
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
                        'flex items-start gap-2.5 px-3 py-2 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors',
                        isNew && 'bg-accent/[0.04]',
                      )}
                    >
                      {/* Status dot — glowing ring for new orders */}
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
                      {/* Price + time */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-app-text tabular-nums">
                          {fmtF(order.total_price)}
                        </span>
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
