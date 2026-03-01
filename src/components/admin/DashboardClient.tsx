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
    <div className="h-full bg-white border border-gray-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardDonut = dynamic(() => import('@/components/features/dashboard/DashboardDonut'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-white border border-gray-100 rounded-2xl animate-pulse" />
  ),
});
const DashboardHourlyBar = dynamic(
  () => import('@/components/features/dashboard/DashboardHourlyBar'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-white border border-gray-100 rounded-2xl animate-pulse" />
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-10 w-40 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl animate-pulse min-h-[300px]" />
          <div className="bg-white border border-gray-100 rounded-2xl animate-pulse min-h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — Bold greeting + date + period selector */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {t('greeting')}, {tenantName}
          </h1>
          <p className="text-sm text-gray-400 mt-1 font-medium">
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} t={t} />
      </div>

      {/* KPIs — Full width row, large cards */}
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

      {/* Charts — 2/3 + 1/3 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-h-[320px]">
          <DashboardCharts
            revenueChartData={revenueChartData}
            t={t}
            showRevenueChart={showRevenueChart}
          />
        </div>
        <div className="flex flex-col gap-4 min-h-[320px]">
          {showFinancials && (
            <div className="flex-1 min-h-[150px]">
              <DashboardDonut data={categoryBreakdown} t={t} fmtCompact={fmtCompact} />
            </div>
          )}
          {showOrders && (
            <div className="flex-1 min-h-[150px]">
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
