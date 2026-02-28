'use client';

import StatsCard, { StatsCardSkeleton } from '@/components/admin/StatsCard';
import type { DashboardStats, SparklinePoint } from '@/types/admin.types';

interface DashboardKPIsProps {
  stats: DashboardStats;
  loading: boolean;
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
  showFinancials?: boolean;
  revenueSparkline?: SparklinePoint[];
  ordersSparkline?: SparklinePoint[];
  itemsSparkline?: SparklinePoint[];
}

export default function DashboardKPIs({
  stats,
  loading,
  t,
  fmtCompact,
  showFinancials = true,
  revenueSparkline,
  ordersSparkline,
  itemsSparkline,
}: DashboardKPIsProps) {
  const cardCount = showFinancials ? 3 : 2;

  if (loading) {
    return (
      <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible snap-x lg:snap-none pb-1 lg:pb-0">
        {Array.from({ length: cardCount }, (_, i) => (
          <div key={i} className="min-w-[160px] lg:min-w-0 snap-start">
            <StatsCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible snap-x lg:snap-none pb-1 lg:pb-0">
      {showFinancials && (
        <div className="min-w-[160px] lg:min-w-0 snap-start">
          <StatsCard
            title={t('revenue')}
            value={fmtCompact(stats.revenueToday)}
            trend={
              stats.revenueTrend !== undefined
                ? { value: stats.revenueTrend, isPositive: stats.revenueTrend >= 0 }
                : undefined
            }
            subtitle={t('todayLabel')}
            sparklineData={revenueSparkline}
          />
        </div>
      )}

      <div className="min-w-[160px] lg:min-w-0 snap-start">
        <StatsCard
          title={t('ordersCount')}
          value={stats.ordersToday}
          trend={
            stats.ordersTrend !== undefined
              ? { value: stats.ordersTrend, isPositive: stats.ordersTrend >= 0 }
              : undefined
          }
          subtitle={t('todayLabel')}
          sparklineData={ordersSparkline}
        />
      </div>

      <div className="min-w-[160px] lg:min-w-0 snap-start">
        <StatsCard
          title={t('activeDishes')}
          value={stats.activeItems}
          subtitle={t('onMenuSubtitle')}
          sparklineData={itemsSparkline}
        />
      </div>
    </div>
  );
}
