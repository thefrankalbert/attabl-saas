'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { BarChart3, Package, QrCode } from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency, getCurrencyConfig } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import { MetricsRow, type MetricDescriptor, type MetricKey } from './dashboard/MetricsRow';
// OverviewChart brings in recharts (~200KB). Defer with next/dynamic so it
// doesn't block the initial admin shell render. Types still imported eagerly
// - type imports are erased at build time.
import type { ChartMetric, ChartRange, SeriesPoint } from './dashboard/OverviewChart';
const OverviewChart = dynamic(
  () => import('./dashboard/OverviewChart').then((m) => m.OverviewChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-app-elevated" />,
  },
);
import { TopDishesCard, type TopDish } from './dashboard/TopDishesCard';
import { StockAlertsCard, type StockAlert } from './dashboard/StockAlertsCard';
// LiveOrdersFeed subscribes to Supabase realtime - only needed once hydrated.
const LiveOrdersFeed = dynamic(
  () => import('./dashboard/LiveOrdersFeed').then((m) => m.LiveOrdersFeed),
  {
    ssr: false,
    loading: () => <div className="h-[200px] w-full animate-pulse rounded-xl bg-app-elevated" />,
  },
);
import type {
  DashboardBucketSeries,
  DashboardDayBucket,
  TopDishRecord,
  StockAlertRecord,
} from '@/types/dashboard.types';

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
  initialBuckets?: DashboardBucketSeries;
  initialTopDishes?: TopDishRecord[];
  initialStockAlerts?: StockAlertRecord[];
  initialActiveTables?: { used: number; total: number };
};

function weekdayShort(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { weekday: 'short' });
}

function weekLabel(bucketIndex: number, total: number, locale: string, bucketDate: string): string {
  const d = new Date(bucketDate);
  if (total <= 7) return weekdayShort(d, locale);
  if (total <= 30) return d.toLocaleDateString(locale, { day: 'numeric' });
  // quarter: show weekly ticks every ~7 days
  if (bucketIndex % 7 !== 0 && bucketIndex !== total - 1) return '';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function buildSeries(
  current: DashboardDayBucket[],
  previous: DashboardDayBucket[],
  metric: ChartMetric,
  locale: string,
): SeriesPoint[] {
  return current.map((b, i) => {
    const prevValue =
      previous.length === current.length
        ? metric === 'revenue'
          ? previous[i].revenue
          : previous[i].count
        : 0;
    return {
      label: weekLabel(i, current.length, locale, b.date),
      value: metric === 'revenue' ? b.revenue : b.count,
      prev: prevValue,
    };
  });
}

export default function DashboardClient(props: DashboardClientProps) {
  const {
    tenantSlug,
    tenantName,
    userName,
    currency = 'XAF',
    initialBuckets,
    initialTopDishes = [],
    initialStockAlerts = [],
    initialActiveTables = { used: 0, total: 0 },
  } = props;

  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const to = useTranslations('orders');
  const locale = useLocale();

  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtF = useCallback((n: number) => formatCurrency(n, currency as CurrencyCode), [currency]);
  const currencySymbol = getCurrencyConfig(currency as CurrencyCode).symbol;

  const { stats, recentOrders, loading } = useDashboardData(props);
  const { can } = usePermissions();
  const showFin = can('canViewAllFinances');

  const [metricKey, setMetricKey] = useState<MetricKey>('revenue');
  const [range, setRange] = useState<ChartRange>('week');
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hour = currentTime.getHours();
  const greetKey: 'goodMorning' | 'goodAfternoon' | 'goodEvening' =
    hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  // ── Metrics row
  // Depend on primitive stat values, not the whole `stats` object -
  // TanStack Query returns a fresh reference on every refetch even when
  // values are unchanged, which would defeat the memo otherwise.
  const revenueToday = stats.revenueToday;
  const ordersToday = stats.ordersToday;
  const activeItems = stats.activeItems;
  const activeCards = stats.activeCards;
  const revenueTrend = stats.revenueTrend;
  const ordersTrend = stats.ordersTrend;
  const activeTablesUsed = initialActiveTables.used;
  const activeTablesTotal = initialActiveTables.total;
  const weekBuckets = initialBuckets?.week;

  const metrics: MetricDescriptor[] = useMemo(() => {
    const revenueSpark = (weekBuckets ?? []).map((b) => b.revenue);
    const orderSpark = (weekBuckets ?? []).map((b) => b.count);
    return [
      {
        key: 'revenue',
        label: t('revenueToday'),
        value: showFin ? fmtF(revenueToday) : '•••',
        unit: currencySymbol,
        compareText: revenueTrend !== undefined ? t('vsYesterday') : undefined,
        deltaPercent: revenueTrend,
        sparkline: revenueSpark,
        live: true,
      },
      {
        key: 'items',
        label: t('activeItems'),
        value: String(activeItems),
        compareText: '',
        deltaPercent: 0,
      },
      {
        key: 'orders',
        label: t('ordersToday'),
        value: String(ordersToday),
        compareText: ordersTrend !== undefined ? t('vsYesterday') : undefined,
        deltaPercent: ordersTrend,
        sparkline: orderSpark,
      },
      {
        key: 'tables',
        label: t('activeTables'),
        value: `${activeTablesUsed}`,
        unit: `/${activeTablesTotal || activeCards}`,
        compareText: '',
        deltaPercent: 0,
      },
    ];
  }, [
    t,
    fmtF,
    currencySymbol,
    showFin,
    revenueToday,
    ordersToday,
    activeItems,
    activeCards,
    revenueTrend,
    ordersTrend,
    activeTablesUsed,
    activeTablesTotal,
    weekBuckets,
  ]);

  // ── Chart data
  const chartMetric: ChartMetric = metricKey === 'orders' ? 'orders' : 'revenue';
  const chartSeries: SeriesPoint[] = useMemo(() => {
    if (!initialBuckets) return [];
    const current = initialBuckets[range] ?? [];
    // Previous period comes from the quarter window (90d back only).
    // Week → previous 7d, Month → previous 30d. Quarter has no comparable
    // window because we only fetch 90d; return an empty prev to hide the
    // dashed comparison line on that range.
    const previous = (() => {
      const q = initialBuckets.quarter;
      if (!q.length || range === 'quarter') return [];
      if (range === 'week') return q.slice(-14, -7);
      return q.slice(-60, -30);
    })();
    return buildSeries(current, previous, chartMetric, locale);
  }, [initialBuckets, range, chartMetric, locale]);

  const chartTotal = useMemo(() => {
    const current = initialBuckets ? (initialBuckets[range] ?? []) : [];
    return chartMetric === 'revenue'
      ? current.reduce((s, b) => s + b.revenue, 0)
      : current.reduce((s, b) => s + b.count, 0);
  }, [initialBuckets, range, chartMetric]);

  // ── Top dishes
  const topDishes: TopDish[] = useMemo(
    () =>
      initialTopDishes.map((d) => {
        const dayKeys = Object.keys(d.dayCounts).sort();
        const trend = dayKeys.length > 1 ? dayKeys.map((k) => d.dayCounts[k]) : [0, d.portions];
        return {
          id: d.id,
          name: d.name,
          subline: `${d.category} · ${fmtF(d.revenue / Math.max(d.portions, 1))}`,
          category: d.category.toLowerCase(),
          categoryLabel: d.category.toUpperCase(),
          portions: d.portions,
          revenue: d.revenue,
          trend,
          color: d.color,
          initials: d.initials,
          available: d.available,
        };
      }),
    [initialTopDishes, fmtF],
  );

  const topDishCategories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of topDishes) {
      if (!seen.has(d.category)) seen.set(d.category, d.categoryLabel);
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [topDishes]);

  // ── Stock alerts
  const stockAlerts: StockAlert[] = useMemo(
    () =>
      initialStockAlerts.map((a) => ({
        id: a.id,
        level: a.level,
        title: a.title,
        subtitle: t('stockAlertSubtitle', {
          current: a.current,
          threshold: a.threshold,
          unit: a.unit,
        }),
      })),
    [initialStockAlerts, t],
  );

  // ── Loading
  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">
        <div className="h-8 w-48 sm:w-64 rounded-lg bg-app-elevated/30 animate-pulse" />
        <div className="h-[120px] rounded-[10px] bg-app-elevated/30 animate-pulse" />
        <div className="flex-1 rounded-[10px] bg-app-elevated/30 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 pb-12">
      {/* Page head */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-app-text">
            {t(greetKey)}, {userName || tenantName}
            <span className="text-app-text-muted font-normal"> - {t('pageSubtitle')}</span>
          </h1>
          <p
            className="font-mono text-[13px] text-app-text-secondary mt-0.5"
            suppressHydrationWarning
          >
            <span className="capitalize">
              {currentTime.toLocaleDateString(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
            {' · '}
            {currentTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {t('liveLabel')}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Link
            href={`${adminBase}/qr-codes`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-app-border bg-app-card text-[13px] text-app-text hover:bg-app-elevated transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            {t('qrGenerator')}
          </Link>
          <Link
            href={`${adminBase}/reports`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-app-border bg-app-card text-[13px] text-app-text hover:bg-app-elevated transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {t('reportsLabel')}
          </Link>
          <Link
            href={`${adminBase}/stock-history`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-app-border bg-app-card text-[13px] text-app-text hover:bg-app-elevated transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            {t('stockHistoryLabel')}
          </Link>
        </div>
      </div>

      {/* Metrics row */}
      <MetricsRow
        metrics={metrics}
        activeKey={metricKey}
        onSelect={(key) => {
          setMetricKey(key);
        }}
        tUp={t('trendUp')}
        tDown={t('trendDown')}
      />

      {/* Main grid: chart + feed */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
        <div className="flex flex-col gap-5 min-w-0">
          <OverviewChart
            metric={chartMetric}
            onMetricChange={(next) => setMetricKey(next === 'orders' ? 'orders' : 'revenue')}
            range={range}
            onRangeChange={setRange}
            series={chartSeries}
            total={chartTotal}
            formatValue={fmtF}
            totalLabel={t(
              range === 'week' ? 'total7d' : range === 'month' ? 'total30d' : 'total90d',
            )}
            legendCurrent={t('legendCurrent')}
            legendPrev={t('legendPrev')}
            revenueLabel={t('revenueLabel')}
            ordersLabel={t('ordersLabel')}
            rangeLabels={{
              week: t('range7d'),
              month: t('range30d'),
              quarter: t('range90d'),
            }}
            title={t('dashboardOverview')}
          />
          <TopDishesCard
            dishes={topDishes}
            formatValue={fmtF}
            title={t('topDishesTitle')}
            rangeBadge={t('range7dShort')}
            placeholder={t('topDishesSearch')}
            tabAll={tc('all')}
            tabs={topDishCategories}
            headers={{
              dish: t('thDish'),
              portions: t('thPortions'),
              revenue: t('thRevenue'),
              category: t('thCategory'),
              status: t('thStatus'),
              trend: t('thTrend'),
            }}
            availableLabel={t('dishAvailable')}
            unavailableLabel={t('dishUnavailable')}
            emptyLabel={t('topDishesEmpty')}
          />
        </div>

        <div className="flex flex-col gap-5">
          <StockAlertsCard
            alerts={stockAlerts}
            title={t('stockAlertsTitle')}
            watchingLabel={t('stockAlertsWatching')}
            emptyLabel={t('stockAlertsEmpty')}
            viewAllHref={`${adminBase}/inventory`}
            viewAllLabel={t('stockAlertsViewAll')}
          />
          <LiveOrdersFeed
            orders={recentOrders}
            adminBase={adminBase}
            formatValue={fmtF}
            currentTime={currentTime}
            labels={{
              title: t('recentOrders'),
              countSuffix: t('todaySuffix'),
              pauseTitle: t('feedPause'),
              resumeTitle: t('feedResume'),
              emptyTitle: t('noOrdersDescAlt'),
              emptySubtitle: t('noOrdersHint'),
              newLabel: 'NEW',
              statusDelivered: to('statusDeliveredCard'),
              statusPending: to('statusPendingCard'),
              statusPreparing: to('statusPreparingCard'),
              statusCanceled: to('statusCancelledCard'),
              statusDefault: to('statusPendingCard'),
            }}
          />
        </div>
      </div>
    </div>
  );
}
