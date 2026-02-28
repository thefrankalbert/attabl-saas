'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { StatsCardSkeleton } from '@/components/admin/StatsCard';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardKPIs from '@/components/features/dashboard/DashboardKPIs';
import PeriodSelector from '@/components/features/dashboard/PeriodSelector';
import type { Period } from '@/components/features/dashboard/PeriodSelector';
import DashboardRecentOrders from '@/components/features/dashboard/DashboardRecentOrders';
import dynamic from 'next/dynamic';

const DashboardCharts = dynamic(() => import('@/components/features/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardDonut = dynamic(() => import('@/components/features/dashboard/DashboardDonut'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardHourlyBar = dynamic(
  () => import('@/components/features/dashboard/DashboardHourlyBar'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-white border border-zinc-100 rounded-2xl animate-pulse" />
    ),
  },
);

type DashboardClientProps = UseDashboardDataParams;

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF' } = props;
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmt = (amount: number) => formatCurrency(amount, currency as CurrencyCode);
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const [period, setPeriod] = useState<Period>('week');

  const {
    stats,
    recentOrders,
    stockItems,
    categoryBreakdown,
    hourlyOrders,
    revenueSparkline,
    ordersSparkline,
    itemsSparkline,
    loading,
    handleStatusChange,
  } = useDashboardData(props);

  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');
  const showRevenueChart = can('canViewAllFinances');
  const showOrders = can('canViewAllOrders') || can('canViewOwnOrders');
  const showStock = can('canViewStocks');

  // Revenue chart data: 7-day sparkline as chart data
  const revenueChartData = revenueSparkline.map((point, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (revenueSparkline.length - 1 - i));
    return { day: d.toLocaleDateString(locale, { weekday: 'short' }), revenue: point.value };
  });

  if (loading) {
    return (
      <div className="min-h-0 lg:h-full flex flex-col gap-4 xl:gap-5 overflow-y-auto">
        <div className="flex items-center justify-between shrink-0">
          <div className="h-7 w-48 bg-zinc-200 rounded animate-pulse" />
          <div className="h-8 w-36 bg-zinc-100 rounded-xl animate-pulse" />
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4 xl:gap-5">
          <div className="flex lg:flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <StatsCardSkeleton key={i} />
            ))}
          </div>
          <div className="bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[200px]" />
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[150px]" />
            <div className="flex-1 bg-white border border-zinc-100 rounded-2xl animate-pulse min-h-[150px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 lg:h-full flex flex-col gap-4 xl:gap-5 overflow-y-auto">
      {/* Greeting Bar */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-zinc-900">
          {t('greeting')}, {tenantName}
        </h1>
        <PeriodSelector value={period} onChange={setPeriod} t={t} />
      </div>

      {/* Main Content: 3-column on desktop */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[220px_1fr_260px] gap-4 xl:gap-5">
        {/* Left column: KPIs stacked vertically */}
        <DashboardKPIs
          stats={stats}
          loading={false}
          t={t}
          fmtCompact={fmtCompact}
          showFinancials={showFinancials}
          revenueSparkline={revenueSparkline}
          ordersSparkline={ordersSparkline}
          itemsSparkline={itemsSparkline}
        />

        {/* Center column: AreaChart */}
        <div className="min-h-[250px] lg:min-h-0">
          <DashboardCharts
            revenueChartData={revenueChartData}
            t={t}
            showRevenueChart={showRevenueChart}
          />
        </div>

        {/* Right column: Donut + HourlyBar stacked */}
        <div className="flex flex-col gap-4 xl:gap-5 min-h-0">
          {showFinancials && (
            <div className="flex-1 min-h-[180px]">
              <DashboardDonut data={categoryBreakdown} t={t} fmtCompact={fmtCompact} />
            </div>
          )}
          {showOrders && (
            <div className="flex-1 min-h-[180px]">
              <DashboardHourlyBar data={hourlyOrders} t={t} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Orders + Stock */}
      {(showOrders || showStock) && (
        <DashboardRecentOrders
          recentOrders={recentOrders}
          stockItems={stockItems}
          adminBase={adminBase}
          t={t}
          tc={tc}
          locale={locale}
          fmt={fmt}
          timeAgoFn={timeAgo}
          onStatusChange={handleStatusChange}
          showOrders={showOrders}
          showStock={showStock}
        />
      )}
    </div>
  );
}
