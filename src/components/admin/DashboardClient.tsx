'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useDashboardData, timeAgo } from '@/hooks/useDashboardData';
import type { UseDashboardDataParams } from '@/hooks/useDashboardData';
import { formatCurrencyCompact, formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode, PopularItem } from '@/types/admin.types';
import { usePermissions } from '@/hooks/usePermissions';
import AdminHomeGrid from '@/components/admin/AdminHomeGrid';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Package,
  LayoutGrid,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
};

// ─── Status color map ───────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-500 ring-amber-500/20',
  preparing: 'bg-purple-500/15 text-purple-500 ring-purple-500/20',
  ready: 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/20',
  delivered: 'bg-app-elevated text-app-text-muted ring-app-border',
  cancelled: 'bg-red-500/15 text-red-500 ring-red-500/20',
};

// ─── KPI Card ───────────────────────────────────────────

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: number;
  subtitle?: string;
  accentClass: string;
}

function KPICard({ icon, label, value, trend, subtitle, accentClass }: KPICardProps) {
  return (
    <div className="group relative flex-1 min-w-[150px] rounded-2xl border border-app-border bg-app-card p-4 transition-all duration-200 hover:border-app-border-hover hover:shadow-lg hover:shadow-black/5">
      {/* Accent glow on hover */}
      <div
        className={cn(
          'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none',
          accentClass.includes('emerald') && 'bg-emerald-500/[0.03]',
          accentClass.includes('accent') && 'bg-accent/[0.03]',
          accentClass.includes('blue') && 'bg-blue-500/[0.03]',
          accentClass.includes('amber') && 'bg-amber-500/[0.03]',
          accentClass.includes('purple') && 'bg-purple-500/[0.03]',
        )}
      />

      <div className="relative flex items-start gap-3">
        <div className={cn('shrink-0 rounded-xl p-2.5', accentClass)}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-app-text-muted font-semibold truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-[1.75rem] font-black text-app-text tabular-nums tracking-tight leading-none">
              {value}
            </span>
            {trend !== undefined && trend !== 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  trend > 0
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-red-500/10 text-red-500',
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5" />
                )}
                {trend > 0 ? '+' : ''}
                {trend}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[10px] text-app-text-muted mt-1 font-medium">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-bold text-app-text-muted uppercase tracking-[0.14em]">
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

// ─── Category Card ──────────────────────────────────────

const CATEGORY_PALETTES = [
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/15', text: 'text-emerald-500' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/15', text: 'text-amber-500' },
  { bg: 'bg-blue-500/10', border: 'border-blue-500/15', text: 'text-blue-500' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/15', text: 'text-purple-500' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/15', text: 'text-rose-500' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/15', text: 'text-cyan-500' },
];

// ─── Dashboard ──────────────────────────────────────────

export default function DashboardClient(props: DashboardClientProps) {
  const {
    tenantSlug,
    tenantName,
    currency = 'XAF',
    establishmentType,
    initialPopularItems = [],
  } = props;
  const t = useTranslations('admin');
  const locale = useLocale();
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency as CurrencyCode);
  const fmtFull = (amount: number) => formatCurrency(amount, currency as CurrencyCode);

  const {
    stats,
    recentOrders,
    categoryBreakdown,
    revenueSparkline,
    loading,
  } = useDashboardData(props);

  const { can } = usePermissions();
  const showFinancials = can('canViewAllFinances');

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';

  const pendingCount = recentOrders.filter((o) => o.status === 'pending').length;
  const avgBasket =
    stats.ordersToday > 0 ? Math.round(stats.revenueToday / stats.ordersToday) : 0;

  // ─── Loading skeleton ──────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-5 overflow-hidden">
        {/* Greeting */}
        <div className="shrink-0 space-y-1">
          <div className="h-6 w-56 bg-app-elevated rounded-lg animate-pulse" />
          <div className="h-3.5 w-36 bg-app-elevated rounded-lg animate-pulse" />
        </div>
        {/* KPI bar */}
        <div className="shrink-0 flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 min-w-[150px] h-[88px] rounded-2xl bg-app-elevated/60 animate-pulse"
            />
          ))}
        </div>
        {/* 2-col */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="rounded-2xl bg-app-elevated/60 animate-pulse" />
          <div className="rounded-2xl bg-app-elevated/60 animate-pulse" />
        </div>
        {/* 2-col */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-[220px] rounded-2xl bg-app-elevated/60 animate-pulse" />
          <div className="h-[220px] rounded-2xl bg-app-elevated/60 animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-5 overflow-y-auto scrollbar-hide">
      {/* ━━━ Greeting ━━━ */}
      <div className="shrink-0">
        <h1 className="text-xl sm:text-2xl font-black text-app-text tracking-tight">
          {t(greetingKey)}, {tenantName}
        </h1>
        <p className="text-xs text-app-text-muted mt-0.5 capitalize font-medium">
          {new Date().toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* ━━━ Section 1: KPI Bar ━━━ */}
      <div className="shrink-0 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {showFinancials && (
          <KPICard
            icon={<DollarSign className="w-4 h-4" />}
            label={t('revenueToday')}
            value={fmtCompact(stats.revenueToday)}
            trend={stats.revenueTrend}
            accentClass="bg-emerald-500/15 text-emerald-500"
          />
        )}
        <KPICard
          icon={<ShoppingBag className="w-4 h-4" />}
          label={t('ordersToday')}
          value={stats.ordersToday}
          trend={stats.ordersTrend}
          accentClass="bg-accent/15 text-accent"
        />
        <KPICard
          icon={<Package className="w-4 h-4" />}
          label={t('activeItems')}
          value={stats.activeItems}
          subtitle={t('onMenuSubtitle')}
          accentClass="bg-blue-500/15 text-blue-500"
        />
        <KPICard
          icon={<LayoutGrid className="w-4 h-4" />}
          label={t('activeTables')}
          value={stats.activeCards}
          subtitle={t('salesPoints')}
          accentClass="bg-amber-500/15 text-amber-500"
        />
        {showFinancials && (
          <KPICard
            icon={<TrendingUp className="w-4 h-4" />}
            label={t('avgBasket')}
            value={avgBasket > 0 ? fmtCompact(avgBasket) : '—'}
            subtitle={t('perOrder')}
            accentClass="bg-purple-500/15 text-purple-500"
          />
        )}
      </div>

      {/* ━━━ Section 2: Overview + Recent Orders ━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Overview */}
        <div className="rounded-2xl border border-app-border bg-app-card p-5">
          <SectionHeader title={t('dashboardOverview')} />

          {/* Big revenue number */}
          {showFinancials && (
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-app-text-muted font-semibold">
                {t('revenueToday')}
              </p>
              <div className="flex items-baseline gap-2.5 mt-1.5">
                <span className="text-[2.75rem] font-black text-app-text tabular-nums tracking-tighter leading-none">
                  {fmtCompact(stats.revenueToday)}
                </span>
                {stats.revenueTrend !== undefined && stats.revenueTrend !== 0 && (
                  <span
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      stats.revenueTrend > 0
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-red-500/10 text-red-500',
                    )}
                  >
                    {stats.revenueTrend > 0 ? '+' : ''}
                    {stats.revenueTrend}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Pending orders alert */}
          {pendingCount > 0 && (
            <div className="mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/15">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-semibold text-amber-500">
                {t('pendingCount', { count: pendingCount })}
              </p>
            </div>
          )}

          {/* Sparkline */}
          {revenueSparkline.length > 1 && (
            <div className="mt-1 -mx-1">
              <ResponsiveContainer width="100%" height={56}>
                <AreaChart
                  data={revenueSparkline}
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="overview-spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--app-accent)"
                    fill="url(#overview-spark)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex gap-2.5 mt-5">
            <Link
              href={`${adminBase}/orders`}
              className="flex-1 text-center px-4 py-2.5 rounded-xl bg-accent text-accent-text text-sm font-bold hover:brightness-110 transition-all active:scale-[0.98]"
            >
              {t('viewOrders')}
            </Link>
            <Link
              href={`${adminBase}/pos`}
              className="flex-1 text-center px-4 py-2.5 rounded-xl border border-app-border bg-app-elevated text-app-text text-sm font-bold hover:bg-app-hover transition-all active:scale-[0.98]"
            >
              {t('openPos')}
            </Link>
          </div>
        </div>

        {/* Right: Recent Orders */}
        <div className="rounded-2xl border border-app-border bg-app-card p-5">
          <SectionHeader
            title={t('recentOrders')}
            action={{ label: t('viewAll'), href: `${adminBase}/orders` }}
          />

          <div className="space-y-2">
            {recentOrders.slice(0, 4).map((order) => (
              <Link
                key={order.id}
                href={`${adminBase}/orders/${order.id}`}
                className="group flex items-center gap-3 p-3 rounded-xl bg-app-elevated/50 hover:bg-app-elevated transition-all duration-150"
              >
                {/* Status dot */}
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    order.status === 'pending' && 'bg-amber-500',
                    order.status === 'preparing' && 'bg-purple-500',
                    order.status === 'ready' && 'bg-emerald-500',
                    order.status === 'delivered' && 'bg-app-text-muted',
                    order.status === 'cancelled' && 'bg-red-500',
                  )}
                />

                {/* Order info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-app-text">
                      {order.table_number}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ring-1',
                        STATUS_STYLES[order.status] || STATUS_STYLES.pending,
                      )}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3 text-app-text-muted" />
                    <span className="text-[11px] text-app-text-muted font-medium">
                      {timeAgo(order.created_at, t, locale)}
                    </span>
                  </div>
                </div>

                {/* Amount + arrow */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-app-text tabular-nums">
                    {fmtFull(order.total_price)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-app-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}

            {recentOrders.length === 0 && (
              <div className="text-center py-10">
                <ShoppingBag className="w-8 h-8 text-app-text-muted mx-auto mb-2 opacity-40" />
                <p className="text-sm text-app-text-muted">{t('noOrdersDescAlt')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Section 3: Categories + Top Items ━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Popular Categories */}
        <div className="rounded-2xl border border-app-border bg-app-card p-5">
          <SectionHeader title={t('popularCategories')} />

          <div className="grid grid-cols-2 gap-2.5">
            {categoryBreakdown.length > 0 ? (
              categoryBreakdown.map((cat, i) => {
                const palette = CATEGORY_PALETTES[i % CATEGORY_PALETTES.length];
                return (
                  <div
                    key={cat.name}
                    className={cn(
                      'rounded-xl border p-3.5 transition-all duration-150 hover:scale-[1.02]',
                      palette.bg,
                      palette.border,
                    )}
                  >
                    <p
                      className={cn(
                        'text-[11px] font-bold uppercase tracking-wider',
                        palette.text,
                      )}
                    >
                      {cat.name}
                    </p>
                    <p className="text-xl font-black text-app-text mt-1.5 tabular-nums tracking-tight">
                      {fmtCompact(cat.value)}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 text-center py-10">
                <p className="text-sm text-app-text-muted">{t('noDataAvailable')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Top Items */}
        <div className="rounded-2xl border border-app-border bg-app-card p-5">
          <SectionHeader title={t('topDishes')} />

          <div className="space-y-1">
            {initialPopularItems.length > 0 ? (
              initialPopularItems.slice(0, 5).map((item: PopularItem, i: number) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-app-elevated/50 transition-colors"
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0',
                      i === 0 && 'bg-accent/15 text-accent',
                      i === 1 && 'bg-app-elevated text-app-text-secondary',
                      i === 2 && 'bg-app-elevated text-app-text-secondary',
                      i > 2 && 'bg-transparent text-app-text-muted',
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Image */}
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-app-elevated shrink-0 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 text-app-text-muted" />
                    </div>
                  )}

                  {/* Name */}
                  <span className="flex-1 text-sm font-medium text-app-text truncate">
                    {item.name}
                  </span>

                  {/* Count */}
                  <span className="text-sm font-bold text-app-text tabular-nums">
                    {item.order_count}
                    <span className="text-[10px] text-app-text-muted font-medium ml-0.5">
                      cmd
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-app-text-muted">{t('noDataAvailable')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Section 4: Quick Access ━━━ */}
      <div className="shrink-0">
        <h2 className="text-[11px] font-bold text-app-text-muted uppercase tracking-[0.14em] mb-3">
          {t('quickAccessTitle')}
        </h2>
        <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
      </div>
    </div>
  );
}
