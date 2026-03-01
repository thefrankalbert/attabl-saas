'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import AdminHomeGrid from '@/components/admin/AdminHomeGrid';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & { establishmentType?: string };

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF', establishmentType } = props;
  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const { stats, loading } = useDashboardData(props);
  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  if (loading) {
    return (
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 gap-6">
        <div className="space-y-1">
          <div className="h-7 w-48 bg-app-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-32 bg-app-elevated/50 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[76px] bg-app-card border border-app-border rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="flex-1 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-fr">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'bg-app-card border border-app-border rounded-xl animate-pulse',
                i === 0 && 'col-span-2 row-span-2',
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('ordersToday'), value: stats.ordersToday, trend: stats.ordersTrend },
    ...(showFinancials
      ? [
          {
            label: t('revenueToday'),
            value: fmtCompact(stats.revenueToday),
            trend: stats.revenueTrend,
          },
        ]
      : []),
    { label: t('activeItems'), value: stats.activeItems },
  ];

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 gap-6">
      {/* Greeting — simple text on page background */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">
          {t(greetingKey)}, {tenantName}
        </h1>
        <p className="text-sm text-app-text-muted mt-0.5 capitalize">
          {new Date().toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* KPI strip */}
      <div
        className={cn(
          'grid gap-3',
          kpis.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-app-card rounded-xl border border-app-border px-4 py-3.5"
          >
            <p className="text-[11px] uppercase tracking-widest text-app-text-muted font-medium truncate">
              {kpi.label}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-app-text tabular-nums leading-tight">
                {kpi.value}
              </span>
              {kpi.trend !== undefined && kpi.trend !== 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[10px] font-semibold',
                    kpi.trend > 0 ? 'text-status-success' : 'text-status-error',
                  )}
                >
                  {kpi.trend > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {kpi.trend > 0 ? '+' : ''}
                  {kpi.trend}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation grid */}
      <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
    </div>
  );
}
