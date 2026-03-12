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
      <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
        {Array.from({ length: cardCount }, (_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
      {showFinancials && (
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
      )}

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

      <StatsCard
        title={t('activeDishes')}
        value={stats.activeItems}
        subtitle={t('onMenuSubtitle')}
        sparklineData={itemsSparkline}
      />
    </div>
  );
}
