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
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type DashboardClientProps = UseDashboardDataParams & {
  establishmentType?: string;
};

// ─── Animation variants ─────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

// ─── Status color map ───────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-500',
  preparing: 'bg-purple-500/15 text-purple-500',
  ready: 'bg-emerald-500/15 text-emerald-500',
  delivered: 'bg-app-elevated text-app-text-muted',
  cancelled: 'bg-red-500/15 text-red-500',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-500 shadow-amber-500/50',
  preparing: 'bg-purple-500 shadow-purple-500/50',
  ready: 'bg-emerald-500 shadow-emerald-500/50',
  delivered: 'bg-app-text-muted',
  cancelled: 'bg-red-500',
};

// ─── KPI Card ───────────────────────────────────────────

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: number;
  subtitle?: string;
  accentClass: string;
  glowColor: string;
}

function KPICard({ icon, label, value, trend, subtitle, accentClass, glowColor }: KPICardProps) {
  return (
    <motion.div
      variants={scaleIn}
      className="group relative rounded-2xl border border-app-border bg-app-card p-3.5 sm:p-4 transition-all duration-300 hover:border-app-border-hover"
    >
      {/* Glow effect on hover */}
      <div
        className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl pointer-events-none"
        style={{ background: glowColor }}
      />

      <div className="relative flex items-start gap-2.5 sm:gap-3">
        <div className={cn('shrink-0 rounded-xl p-2 sm:p-2.5', accentClass)}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] text-app-text-muted font-semibold truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1 sm:gap-1.5 mt-0.5 sm:mt-1">
            <span className="text-xl sm:text-[1.75rem] font-black text-app-text tabular-nums tracking-tight leading-none">
              {value}
            </span>
            {trend !== undefined && trend !== 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded-full',
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
            <p className="text-[9px] sm:text-[10px] text-app-text-muted mt-0.5 sm:mt-1 font-medium">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Section Card ───────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn('rounded-2xl border border-app-border bg-app-card p-4 sm:p-5', className)}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-[11px] font-bold text-app-text-muted uppercase tracking-[0.14em]">
          {title}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-0.5"
          >
            {action.label}
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </motion.div>
  );
}

// ─── Category Palettes ──────────────────────────────────

const CATEGORY_PALETTES = [
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'rgba(16,185,129,0.06)' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'rgba(245,158,11,0.06)' },
  { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'rgba(59,130,246,0.06)' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'rgba(168,85,247,0.06)' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', glow: 'rgba(244,63,94,0.06)' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'rgba(6,182,212,0.06)' },
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

  const { stats, recentOrders, categoryBreakdown, revenueSparkline, loading } =
    useDashboardData(props);

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
      <div className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 overflow-hidden">
        <div className="shrink-0 space-y-1.5">
          <div className="h-7 w-56 bg-app-elevated rounded-lg animate-pulse" />
          <div className="h-3.5 w-36 bg-app-elevated/60 rounded-lg animate-pulse" />
        </div>
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[80px] rounded-2xl bg-app-elevated/50 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
          <div className="rounded-2xl bg-app-elevated/50 animate-pulse min-h-[200px]" />
          <div className="rounded-2xl bg-app-elevated/50 animate-pulse min-h-[200px]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-[200px] rounded-2xl bg-app-elevated/50 animate-pulse" />
          <div className="h-[200px] rounded-2xl bg-app-elevated/50 animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="h-full flex flex-col p-4 sm:p-5 lg:p-6 gap-4 sm:gap-5 overflow-y-auto scrollbar-hide"
    >
      {/* ━━━ Greeting ━━━ */}
      <motion.div variants={fadeUp} className="shrink-0">
        <h1 className="text-xl sm:text-2xl font-black text-app-text tracking-tight">
          {t(greetingKey)}, {tenantName}
        </h1>
        <p className="text-[11px] sm:text-xs text-app-text-muted mt-0.5 capitalize font-medium">
          {new Date().toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </motion.div>

      {/* ━━━ Section 1: KPI Grid ━━━ */}
      <motion.div
        variants={stagger}
        className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3"
      >
        {showFinancials && (
          <KPICard
            icon={<DollarSign className="w-4 h-4" />}
            label={t('revenueToday')}
            value={fmtCompact(stats.revenueToday)}
            trend={stats.revenueTrend}
            accentClass="bg-emerald-500/15 text-emerald-500"
            glowColor="rgba(16,185,129,0.08)"
          />
        )}
        <KPICard
          icon={<ShoppingBag className="w-4 h-4" />}
          label={t('ordersToday')}
          value={stats.ordersToday}
          trend={stats.ordersTrend}
          accentClass="bg-accent/15 text-accent"
          glowColor="rgba(204,255,0,0.06)"
        />
        <KPICard
          icon={<Package className="w-4 h-4" />}
          label={t('activeItems')}
          value={stats.activeItems}
          subtitle={t('onMenuSubtitle')}
          accentClass="bg-blue-500/15 text-blue-500"
          glowColor="rgba(59,130,246,0.08)"
        />
        <KPICard
          icon={<LayoutGrid className="w-4 h-4" />}
          label={t('activeTables')}
          value={stats.activeCards}
          subtitle={t('salesPoints')}
          accentClass="bg-amber-500/15 text-amber-500"
          glowColor="rgba(245,158,11,0.08)"
        />
        {showFinancials && (
          <KPICard
            icon={<TrendingUp className="w-4 h-4" />}
            label={t('avgBasket')}
            value={avgBasket > 0 ? fmtCompact(avgBasket) : '—'}
            subtitle={t('perOrder')}
            accentClass="bg-purple-500/15 text-purple-500"
            glowColor="rgba(168,85,247,0.08)"
          />
        )}
      </motion.div>

      {/* ━━━ Section 2: Overview + Recent Orders ━━━ */}
      <motion.div variants={stagger} className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Left: Overview */}
        <SectionCard title={t('dashboardOverview')}>
          {/* Big revenue number */}
          {showFinancials && (
            <div className="mb-4 sm:mb-5">
              <p className="text-[10px] uppercase tracking-[0.12em] text-app-text-muted font-semibold">
                {t('revenueToday')}
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl sm:text-[2.75rem] font-black text-app-text tabular-nums tracking-tighter leading-none">
                  {fmtCompact(stats.revenueToday)}
                </span>
                {stats.revenueTrend !== undefined && stats.revenueTrend !== 0 && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      stats.revenueTrend > 0
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-red-500/10 text-red-500',
                    )}
                  >
                    {stats.revenueTrend > 0 ? '+' : ''}
                    {stats.revenueTrend}%
                  </motion.span>
                )}
              </div>
            </div>
          )}

          {/* Pending orders alert */}
          {pendingCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/15"
            >
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              </div>
              <p className="text-sm font-semibold text-amber-500">
                {t('pendingCount', { count: pendingCount })}
              </p>
            </motion.div>
          )}

          {/* Sparkline */}
          {revenueSparkline.length > 1 && (
            <div className="mt-1 -mx-1">
              <ResponsiveContainer width="100%" height={52}>
                <AreaChart
                  data={revenueSparkline}
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="overview-spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.4} />
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
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex gap-2 sm:gap-2.5 mt-4 sm:mt-5">
            <Link
              href={`${adminBase}/orders`}
              className="flex-1 text-center px-3 sm:px-4 py-2.5 rounded-xl bg-accent text-accent-text text-xs sm:text-sm font-bold hover:brightness-110 transition-all active:scale-[0.97] touch-manipulation"
            >
              {t('viewOrders')}
            </Link>
            <Link
              href={`${adminBase}/pos`}
              className="flex-1 text-center px-3 sm:px-4 py-2.5 rounded-xl border border-app-border bg-app-elevated text-app-text text-xs sm:text-sm font-bold hover:bg-app-hover transition-all active:scale-[0.97] touch-manipulation"
            >
              {t('openPos')}
            </Link>
          </div>
        </SectionCard>

        {/* Right: Recent Orders */}
        <SectionCard
          title={t('recentOrders')}
          action={{ label: t('viewAll'), href: `${adminBase}/orders` }}
        >
          <div className="space-y-1.5 sm:space-y-2">
            {recentOrders.slice(0, 4).map((order, idx) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + idx * 0.07 }}
              >
                <Link
                  href={`${adminBase}/orders/${order.id}`}
                  className="group flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-app-elevated/40 hover:bg-app-elevated transition-all duration-200 touch-manipulation"
                >
                  {/* Status dot with shadow */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        'w-2.5 h-2.5 rounded-full shadow-[0_0_6px]',
                        STATUS_DOT[order.status] || STATUS_DOT.pending,
                      )}
                    />
                    {order.status === 'pending' && (
                      <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping opacity-60" />
                    )}
                  </div>

                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="font-mono font-bold text-xs sm:text-sm text-app-text">
                        {order.table_number}
                      </span>
                      <span
                        className={cn(
                          'text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
                          STATUS_STYLES[order.status] || STATUS_STYLES.pending,
                        )}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-app-text-muted" />
                      <span className="text-[10px] sm:text-[11px] text-app-text-muted font-medium">
                        {timeAgo(order.created_at, t, locale)}
                      </span>
                    </div>
                  </div>

                  {/* Amount + arrow */}
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-bold text-app-text tabular-nums">
                      {fmtFull(order.total_price)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-app-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              </motion.div>
            ))}

            {recentOrders.length === 0 && (
              <div className="text-center py-8 sm:py-10">
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                >
                  <ShoppingBag className="w-8 h-8 text-app-text-muted mx-auto mb-2 opacity-30" />
                </motion.div>
                <p className="text-xs sm:text-sm text-app-text-muted">{t('noOrdersDescAlt')}</p>
              </div>
            )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ━━━ Section 3: Categories + Top Items ━━━ */}
      <motion.div variants={stagger} className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Left: Popular Categories */}
        <SectionCard title={t('popularCategories')}>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {categoryBreakdown.length > 0 ? (
              categoryBreakdown.map((cat, i) => {
                const palette = CATEGORY_PALETTES[i % CATEGORY_PALETTES.length];
                return (
                  <motion.div
                    key={cat.name}
                    variants={scaleIn}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'rounded-xl border p-3 sm:p-3.5 cursor-default transition-shadow duration-200',
                      palette.bg,
                      palette.border,
                    )}
                    style={{ boxShadow: `inset 0 1px 0 ${palette.glow}` }}
                  >
                    <p
                      className={cn(
                        'text-[10px] sm:text-[11px] font-bold uppercase tracking-wider',
                        palette.text,
                      )}
                    >
                      {cat.name}
                    </p>
                    <p className="text-lg sm:text-xl font-black text-app-text mt-1 sm:mt-1.5 tabular-nums tracking-tight">
                      {fmtCompact(cat.value)}
                    </p>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-2 text-center py-8 sm:py-10">
                <p className="text-xs sm:text-sm text-app-text-muted">{t('noDataAvailable')}</p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Right: Top Items */}
        <SectionCard title={t('topDishes')}>
          <div className="space-y-0.5">
            {initialPopularItems.length > 0 ? (
              initialPopularItems.slice(0, 5).map((item: PopularItem, i: number) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="flex items-center gap-2.5 sm:gap-3 py-2 sm:py-2.5 px-2 rounded-lg hover:bg-app-elevated/40 transition-colors"
                >
                  {/* Rank badge */}
                  <span
                    className={cn(
                      'w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center text-[10px] sm:text-[11px] font-black shrink-0',
                      i === 0 && 'bg-accent/20 text-accent',
                      i === 1 && 'bg-app-elevated text-app-text-secondary',
                      i === 2 && 'bg-app-elevated text-app-text-secondary',
                      i > 2 && 'text-app-text-muted',
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Image */}
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-app-elevated shrink-0 flex items-center justify-center">
                      <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-app-text-muted" />
                    </div>
                  )}

                  {/* Name */}
                  <span className="flex-1 text-xs sm:text-sm font-medium text-app-text truncate">
                    {item.name}
                  </span>

                  {/* Count with bar */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-12 sm:w-16 h-1.5 rounded-full bg-app-elevated overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-accent/60"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, (item.order_count / (initialPopularItems[0]?.order_count || 1)) * 100)}%`,
                        }}
                        transition={{ delay: 0.5 + i * 0.08, duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-app-text tabular-nums min-w-[2rem] text-right">
                      {item.order_count}
                    </span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 sm:py-10">
                <p className="text-xs sm:text-sm text-app-text-muted">{t('noDataAvailable')}</p>
              </div>
            )}
          </div>
        </SectionCard>
      </motion.div>

      {/* ━━━ Section 4: Quick Access ━━━ */}
      <motion.div variants={fadeUp} className="shrink-0">
        <h2 className="text-[11px] font-bold text-app-text-muted uppercase tracking-[0.14em] mb-2.5 sm:mb-3">
          {t('quickAccessTitle')}
        </h2>
        <AdminHomeGrid basePath={adminBase} establishmentType={establishmentType} />
      </motion.div>
    </motion.div>
  );
}
