'use client';

import { useTranslations, useLocale } from 'next-intl';
import { StatsCardSkeleton } from '@/components/admin/StatsCard';
import { useDashboardData, timeAgo, getLast7DaysData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import DashboardStatsSection from '@/components/features/dashboard/DashboardStats';
import DashboardCharts from '@/components/features/dashboard/DashboardCharts';
import DashboardRecentOrders from '@/components/features/dashboard/DashboardRecentOrders';

// ─── Types ─────────────────────────────────────────────────

type DashboardClientProps = UseDashboardDataParams;

// ─── Main Component ────────────────────────────────────────

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, currency = 'XAF' } = props;
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmt = (amount: number) => formatCurrency(amount, currency as CurrencyCode);
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);

  const { stats, recentOrders, stockItems, loading, handleStatusChange } = useDashboardData(props);

  if (loading) {
    return (
      <div className="min-h-0 lg:h-[calc(100dvh-4.5rem)] grid grid-rows-[auto_auto_auto] lg:grid-rows-[auto_1fr_1fr] gap-3 overflow-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
          <div className="col-span-1 md:col-span-2 bg-white border border-neutral-100 rounded-xl animate-pulse min-h-[200px]" />
          <div className="bg-white border border-neutral-100 rounded-xl animate-pulse min-h-[200px]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
          <div className="col-span-1 md:col-span-2 bg-white border border-neutral-100 rounded-xl animate-pulse min-h-[200px]" />
          <div className="bg-white border border-neutral-100 rounded-xl animate-pulse min-h-[200px]" />
        </div>
      </div>
    );
  }

  const revenueChartData = getLast7DaysData(recentOrders).map((count, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayLabel = d.toLocaleDateString(locale, { weekday: 'short' });
    return { day: dayLabel, orders: count };
  });

  return (
    <div className="min-h-0 lg:h-[calc(100dvh-4.5rem)] grid grid-rows-[auto_auto_auto] lg:grid-rows-[auto_1fr_1fr] gap-3 overflow-auto lg:overflow-hidden">
      {/* Row 1 -- KPI Cards */}
      <DashboardStatsSection stats={stats} loading={false} t={t} fmtCompact={fmtCompact} />

      {/* Row 2 -- Revenue Chart + Quick Actions */}
      <DashboardCharts revenueChartData={revenueChartData} adminBase={adminBase} t={t} />

      {/* Row 3 -- Recent Orders + Stock Alerts */}
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
      />
    </div>
  );
}
