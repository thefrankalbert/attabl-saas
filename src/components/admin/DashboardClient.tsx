'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode, SparklinePoint } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import AdminHomeGrid from '@/components/admin/AdminHomeGrid';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & { establishmentType?: string };

// ─── Mini KPI Card (inside hero banner) ─────────────────

interface HeroKPIProps {
  label: string;
  value: string | number;
  trend?: number;
  sparkline?: SparklinePoint[];
  gradientId: string;
}

function HeroKPI({ label, value, trend, sparkline, gradientId }: HeroKPIProps) {
  return (
    <div className="bg-white/[0.07] backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 flex-1 min-w-[120px]">
      <p className="text-[9px] uppercase tracking-widest text-white/60 font-semibold">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-xl font-black text-white tabular-nums tracking-tight leading-none">
          {value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px] font-bold',
              trend > 0 ? 'text-emerald-300' : 'text-red-300',
            )}
          >
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend > 0 ? '+' : ''}
            {trend}%
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <div className="mt-1.5 -mx-1">
          <ResponsiveContainer width="100%" height={22}>
            <AreaChart data={sparkline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="rgba(255,255,255,0.6)"
                fill={`url(#${gradientId})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────

export default function DashboardClient(props: DashboardClientProps) {
  const { tenantSlug, tenantName, currency = 'XAF', establishmentType } = props;
  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const { stats, revenueSparkline, ordersSparkline, itemsSparkline, loading } =
    useDashboardData(props);
  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-hidden">
        <div className="shrink-0 rounded-2xl bg-app-elevated animate-pulse h-[140px]" />
        <div className="flex-1 flex gap-3 min-h-0">
          <div className="w-[200px] shrink-0 flex flex-col gap-3">
            <div className="flex-1 bg-app-elevated rounded-xl animate-pulse" />
            <div className="flex-1 bg-app-elevated rounded-xl animate-pulse" />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3 auto-rows-fr">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="bg-app-card border border-app-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-hidden">
      {/* ━━━ Hero Banner ━━━ */}
      <div className="shrink-0 relative rounded-2xl overflow-hidden bg-gradient-to-br from-accent via-accent/90 to-accent/70 px-5 py-4 sm:px-6 sm:py-5">
        {/* Decorative pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute top-0 right-0 w-1/2 h-full opacity-10"
          style={{
            background: 'radial-gradient(ellipse at 80% 20%, white 0%, transparent 60%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Greeting */}
          <div className="mb-3 sm:mb-4">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {t(greetingKey)}, {tenantName}
            </h1>
            <p className="text-xs text-white/50 mt-0.5 capitalize">
              {new Date().toLocaleDateString(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* KPI cards row */}
          <div className="flex flex-wrap gap-3">
            <HeroKPI
              label={t('ordersToday')}
              value={stats.ordersToday}
              trend={stats.ordersTrend}
              sparkline={ordersSparkline}
              gradientId="hero-spark-orders"
            />
            {showFinancials && (
              <HeroKPI
                label={t('revenueToday')}
                value={fmtCompact(stats.revenueToday)}
                trend={stats.revenueTrend}
                sparkline={revenueSparkline}
                gradientId="hero-spark-revenue"
              />
            )}
            <HeroKPI
              label={t('activeItems')}
              value={stats.activeItems}
              sparkline={itemsSparkline}
              gradientId="hero-spark-items"
            />
          </div>
        </div>
      </div>

      {/* ━━━ Navigation grid ━━━ */}
      <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
    </div>
  );
}
