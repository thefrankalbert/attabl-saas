'use client';

import { ShoppingBag, Banknote, UtensilsCrossed, Users } from 'lucide-react';
import StatsCard, { StatsCardSkeleton } from '@/components/admin/StatsCard';
import type { DashboardStats as DashboardStatsType } from '@/types/admin.types';

// ─── Types ─────────────────────────────────────────────────

interface DashboardStatsProps {
  stats: DashboardStatsType;
  loading: boolean;
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function DashboardStats({ stats, loading, t, fmtCompact }: DashboardStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <StatsCard
        title={t('ordersCount')}
        value={stats.ordersToday}
        icon={ShoppingBag}
        color="blue"
        subtitle={t('todayLabel')}
      />
      <StatsCard
        title={t('revenue')}
        value={fmtCompact(stats.revenueToday)}
        icon={Banknote}
        color="lime"
        subtitle={t('todayLabel')}
      />
      <StatsCard
        title={t('activeDishes')}
        value={stats.activeItems}
        icon={UtensilsCrossed}
        color="purple"
        subtitle={t('onMenuSubtitle')}
      />
      <StatsCard
        title={t('salesPoints')}
        value={stats.activeCards}
        icon={Users}
        color="orange"
        subtitle={t('activePlural')}
      />
    </div>
  );
}
