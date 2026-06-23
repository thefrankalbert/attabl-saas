'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency, getCurrencyConfig } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import { SectionCards, type SectionCardData } from './dashboard/SectionCards';
import { RevenueChart } from './dashboard/RevenueChart';
import { OrdersTable } from './dashboard/OrdersTable';
import type {
  DashboardBucketSeries,
  DashboardChannelSeries,
  TopDishRecord,
  StockAlertRecord,
} from '@/types/dashboard.types';

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
  /** Legacy single-series buckets (still provided by the server, now unused here) */
  initialBuckets?: DashboardBucketSeries;
  initialChannelBuckets?: DashboardChannelSeries;
  initialTopDishes?: TopDishRecord[];
  initialStockAlerts?: StockAlertRecord[];
  initialActiveTables?: { used: number; total: number };
};

const EMPTY_CHANNELS: DashboardChannelSeries = { week: [], month: [], quarter: [] };

export default function DashboardClient(props: DashboardClientProps) {
  const {
    tenantSlug,
    currency = 'XAF',
    initialChannelBuckets = EMPTY_CHANNELS,
    initialActiveTables = { used: 0, total: 0 },
  } = props;

  const t = useTranslations('admin');
  const locale = useLocale();

  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtF = useCallback((n: number) => formatCurrency(n, currency as CurrencyCode), [currency]);
  const currencySymbol = getCurrencyConfig(currency as CurrencyCode).symbol;

  const { stats, recentOrders, loading, handleStatusChange } = useDashboardData(props);
  const { can } = usePermissions();
  const showFin = can('canViewAllFinances');

  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── KPI section cards
  // Depend on primitive stat values, not the whole `stats` object -
  // TanStack Query returns a fresh reference on every refetch even when
  // values are unchanged, which would defeat the memo otherwise.
  const revenueToday = stats.revenueToday;
  const ordersToday = stats.ordersToday;
  const activeCards = stats.activeCards;
  const revenueTrend = stats.revenueTrend;
  const ordersTrend = stats.ordersTrend;
  const activeTablesUsed = initialActiveTables.used;
  const activeTablesTotal = initialActiveTables.total;

  const sectionCards: SectionCardData[] = useMemo(() => {
    const fmtNum = (n: number) =>
      Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 });
    const deltaText = (trend: number | undefined) =>
      trend === undefined ? undefined : `${trend >= 0 ? '+' : ''}${trend}%`;

    // Yesterday raw values are derived exactly from today + the trend %:
    // trend = (today - yesterday) / yesterday  =>  yesterday = today / (1 + trend/100)
    const revYest =
      revenueTrend !== undefined && revenueTrend !== -100
        ? revenueToday / (1 + revenueTrend / 100)
        : undefined;
    const ordYest =
      ordersTrend !== undefined && ordersTrend !== -100
        ? ordersToday / (1 + ordersTrend / 100)
        : undefined;

    const ticketToday = ordersToday > 0 ? revenueToday / ordersToday : 0;
    const ticketYest =
      revYest !== undefined && ordYest !== undefined && ordYest > 0 ? revYest / ordYest : undefined;
    const ticketTrend =
      ticketYest !== undefined && ticketYest > 0
        ? Math.round(((ticketToday - ticketYest) / ticketYest) * 100)
        : undefined;

    const tablesTotal = activeTablesTotal || activeCards;

    return [
      {
        desc: t('revenueToday'),
        value: showFin ? fmtNum(revenueToday) : '•••',
        unit: showFin ? ` ${currencySymbol}` : '',
        deltaText: deltaText(revenueTrend),
        up: (revenueTrend ?? 0) >= 0,
        // No prior-day data -> no trend to claim. Avoid showing "En hausse" on a 0/empty day.
        line1:
          revenueTrend === undefined ? t('kpiFlat') : revenueTrend >= 0 ? t('kpiUp') : t('kpiDown'),
        line2:
          revYest !== undefined && showFin
            ? t('kpiVsYesterdayValue', { value: `${fmtNum(revYest)} ${currencySymbol}` })
            : t('pageSubtitle'),
      },
      {
        desc: t('ordersToday'),
        value: String(ordersToday),
        deltaText: deltaText(ordersTrend),
        up: (ordersTrend ?? 0) >= 0,
        line1:
          ordersTrend === undefined ? t('kpiFlat') : ordersTrend >= 0 ? t('kpiUp') : t('kpiDown'),
        line2:
          ordYest !== undefined
            ? t('kpiOrdersYesterday', { value: fmtNum(ordYest) })
            : t('liveLabel'),
      },
      {
        desc: t('avgTicket'),
        value: showFin ? fmtNum(ticketToday) : '•••',
        unit: showFin ? ` ${currencySymbol}` : '',
        deltaText: deltaText(ticketTrend),
        up: (ticketTrend ?? 0) >= 0,
        line1:
          ticketTrend === undefined
            ? t('kpiAvgFlat')
            : ticketTrend >= 0
              ? t('kpiAvgUp')
              : t('kpiAvgDown'),
        line2: t('kpiAvgFoot'),
      },
      {
        desc: t('activeTables'),
        value: String(activeTablesUsed),
        unit: ` / ${tablesTotal}`,
        deltaText:
          tablesTotal > 0 ? `${Math.round((activeTablesUsed / tablesTotal) * 100)}%` : undefined,
        up: true,
        line1: t('kpiTablesActive'),
        line2: t('kpiTablesFoot', { used: activeTablesUsed, total: tablesTotal }),
      },
    ];
  }, [
    t,
    locale,
    currencySymbol,
    showFin,
    revenueToday,
    ordersToday,
    activeCards,
    revenueTrend,
    ordersTrend,
    activeTablesUsed,
    activeTablesTotal,
  ]);

  // ── Loading
  if (loading) {
    return (
      <div className="flex flex-col gap-5 p-4 @sm:p-6 pb-12 @md:h-full @md:overflow-hidden @md:pb-4 animate-pulse">
        {/* Header row */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="h-7 w-64 bg-app-elevated/30 rounded-lg" />
            <div className="h-4 w-48 bg-app-elevated/30 rounded mt-2" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-app-elevated/30 rounded-md" />
            <div className="h-9 w-28 bg-app-elevated/30 rounded-md" />
            <div className="h-9 w-28 bg-app-elevated/30 rounded-md" />
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-app-elevated/30 rounded-xl border border-app-border/50"
            />
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_320px] @lg:grid-cols-[minmax(0,1fr)_360px] gap-4 flex-1 min-h-0">
          <div className="flex flex-col gap-4">
            <div className="h-[220px] @lg:h-[300px] bg-app-elevated/30 rounded-xl border border-app-border/50" />
            <div className="h-[240px] bg-app-elevated/30 rounded-xl border border-app-border/50" />
          </div>
          <div className="min-h-[240px] @md:h-full bg-app-elevated/30 rounded-xl border border-app-border/50" />
        </div>
      </div>
    );
  }

  return (
    // Maquette layout: vertical stack (KPI cards -> revenue chart -> orders
    // table), full width, scrolling within the admin shell's main area.
    <div className="flex flex-col gap-6 py-6">
      <SectionCards cards={sectionCards} />
      <div className="px-3 @sm:px-5">
        <RevenueChart
          series={initialChannelBuckets}
          formatValue={fmtF}
          locale={locale}
          labels={{
            title: t('chartRevenueTitle'),
            desc: t('chartRevenueDesc'),
            surplace: t('channelSurplace'),
            emporter: t('channelEmporter'),
            range90d: t('range90d'),
            range30d: t('range30d'),
            range7d: t('range7d'),
            totalLabel: t('total90d'),
          }}
        />
      </div>
      <OrdersTable
        orders={recentOrders}
        formatValue={fmtF}
        locale={locale}
        adminBase={adminBase}
        nowMs={currentTime.getTime()}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
