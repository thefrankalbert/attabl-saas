'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import {
  ShoppingBag,
  Banknote,
  UtensilsCrossed,
  Users,
  ArrowRight,
  Clock,
  ChefHat,
  TrendingUp,
  Bell,
  Calendar,
  Eye,
  CheckCircle2,
  Utensils,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardStats } from '@/hooks/queries';
import { useUpdateOrderStatus } from '@/hooks/mutations';
import StatsCard, { StatsCardSkeleton } from '@/components/admin/StatsCard';
import StatusBadge from '@/components/admin/StatusBadge';
import type { Order, DashboardStats, PopularItem } from '@/types/admin.types';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Helpers ───────────────────────────────────────────────

function timeAgo(
  date: string,
  tc: (key: string, values?: Record<string, number>) => string,
  locale: string,
): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return tc('justNow');
  if (seconds < 3600) return tc('minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return tc('hoursAgo', { count: Math.floor(seconds / 3600) });
  return new Date(date).toLocaleDateString(locale);
}

// formatPrice removed — replaced by formatCurrencyCompact

function getLast7DaysData(orders: Order[]): number[] {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  return days.map((day) => orders.filter((o) => o.created_at?.startsWith(day)).length);
}

function MiniChart({ data, tooltipLabel }: { data: number[]; tooltipLabel?: string }) {
  const chartData = data.map((value, index) => ({ day: index, value }));
  if (chartData.every((d) => d.value === 0)) {
    return (
      <div className="h-[40px] flex items-center justify-center text-xs text-neutral-400">--</div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="limeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#CCFF00" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{
            background: '#171717',
            border: '1px solid #262626',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#fff',
          }}
          labelFormatter={() => ''}
          formatter={(value: number | undefined) => [value ?? 0, tooltipLabel ?? '']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#CCFF00"
          fill="url(#limeGradient)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Types ─────────────────────────────────────────────────

interface DashboardClientProps {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialStats: DashboardStats;
  initialRecentOrders: Order[];
  initialPopularItems: PopularItem[];
  currency?: CurrencyCode;
}

// ─── Main Component ────────────────────────────────────────

export default function DashboardClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialStats,
  initialRecentOrders,
  initialPopularItems,
  currency = 'XAF',
}: DashboardClientProps) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  // Base path pour tous les liens admin
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmt = (amount: number) => formatCurrency(amount, currency);
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency);
  const [popularItems] = useState<PopularItem[]>(initialPopularItems);
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  // TanStack Query for dashboard data
  const { data: dashboardData, isLoading: loading } = useDashboardStats(tenantId, {
    stats: initialStats,
    recentOrders: initialRecentOrders,
    stockItems: [],
  });

  const stats = dashboardData?.stats ?? initialStats;
  const recentOrders = dashboardData?.recentOrders ?? initialRecentOrders;
  const stockItems = dashboardData?.stockItems ?? [];

  // Mutation for order status changes
  const updateOrderStatus = useUpdateOrderStatus(tenantId);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    updateOrderStatus.mutate(
      { orderId, status: newStatus },
      {
        onSuccess: () => {
          toast({ title: t('statusUpdated') });
        },
        onError: () => {
          toast({ title: t('statusUpdateError'), variant: 'destructive' });
        },
      },
    );
  };

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
        },
      )
      .subscribe();

    // Realtime for stock changes
    const stockChannel = supabase
      .channel(`dashboard-stock-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ingredients',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      stockChannel.unsubscribe();
      supabase.removeChannel(channel);
      supabase.removeChannel(stockChannel);
    };
  }, [supabase, tenantId, queryClient]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 h-full">
        <div className="animate-pulse">
          <div className="h-7 w-48 bg-neutral-200 rounded-lg" />
          <div className="h-4 w-32 bg-neutral-100 rounded mt-1" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{getGreeting()}</h1>
          <p className="text-neutral-500 text-sm mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            <span className="text-neutral-300">•</span>
            <span className="font-medium text-neutral-700">{tenantName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2.5 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">
            <Bell className="w-5 h-5 text-neutral-600" />
          </button>
          <Link
            href={`${adminBase}/pos`}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#CCFF00] text-black font-semibold rounded-xl hover:bg-[#b8e600] transition-colors"
          >
            <Banknote className="w-5 h-5" />
            {t('openPosButton')}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title={t('revenue')}
          value={fmtCompact(stats.revenueToday)}
          icon={Banknote}
          color="lime"
          subtitle={t('todayLabel')}
        />
        <StatsCard
          title={t('ordersCount')}
          value={stats.ordersToday}
          icon={ShoppingBag}
          color="blue"
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

      {/* Stock en direct */}
      {stockItems.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-neutral-600" />
              <div>
                <h2 className="text-base font-bold text-neutral-900">{t('stockLive')}</h2>
                <p className="text-xs text-neutral-500">{t('stockTop10')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {stockItems.filter((s) => s.current_stock <= 0).length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {t('outOfStockCount', {
                    count: stockItems.filter((s) => s.current_stock <= 0).length,
                  })}
                </span>
              )}
              {stockItems.filter((s) => s.current_stock > 0 && s.current_stock <= s.min_stock_alert)
                .length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {t('lowStockCount', {
                    count: stockItems.filter(
                      (s) => s.current_stock > 0 && s.current_stock <= s.min_stock_alert,
                    ).length,
                  })}
                </span>
              )}
              <Link
                href={`${adminBase}/inventory`}
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-[#CCFF00] transition-colors"
              >
                {t('viewAll')} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10 gap-2">
            {stockItems.map((item) => {
              const isOut = item.current_stock <= 0;
              const isLow = item.current_stock > 0 && item.current_stock <= item.min_stock_alert;
              const maxStock = Math.max(item.min_stock_alert * 3, item.current_stock, 1);
              const pct = Math.min((item.current_stock / maxStock) * 100, 100);

              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-3 rounded-xl border transition-colors',
                    isOut
                      ? 'border-red-200 bg-red-50/50'
                      : isLow
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-neutral-100 bg-neutral-50/50',
                  )}
                >
                  <p className="text-xs font-bold text-neutral-900 truncate">{item.name}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span
                      className={cn(
                        'text-lg font-black',
                        isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900',
                      )}
                    >
                      {item.current_stock}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-medium">{item.unit}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500',
                      )}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders + Popular Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-neutral-900">{t('recentOrders')}</h2>
                <p className="text-sm text-neutral-500">
                  {t('ordersCountLabel', { count: recentOrders.length })}
                </p>
              </div>
              {recentOrders.filter((o) => o.status === 'pending').length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold">
                  <Clock className="w-3 h-3" />
                  {recentOrders.filter((o) => o.status === 'pending').length} {t('pendingLabel')}
                </span>
              )}
            </div>
            <Link
              href={`${adminBase}/orders`}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-[#CCFF00] transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="divide-y divide-neutral-50">
              {recentOrders.map((order) => (
                <div key={order.id} className="p-4 hover:bg-neutral-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        {order.table_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-neutral-900">
                            {t('tableLabel')} {order.table_number}
                          </h3>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          {order.items
                            ?.slice(0, 2)
                            .map((i) => i.name)
                            .join(', ')}
                          {order.items && order.items.length > 2 && ` +${order.items.length - 2}`}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {timeAgo(order.created_at, tc, locale)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Utensils className="w-3.5 h-3.5" />
                            {order.items?.reduce((s, i) => s + i.quantity, 0) || 0} {t('items')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-900">{fmt(order.total_price)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'preparing')}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title={t('startPreparation')}
                          >
                            <ChefHat className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'ready')}
                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            title={t('markReady')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'delivered')}
                            className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                            title={t('markDelivered')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`${adminBase}/orders`}
                          className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                          title={t('viewDetails')}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-1">{t('noOrders')}</h3>
              <p className="text-sm text-neutral-500">{t('noOrdersDescAlt')}</p>
            </div>
          )}
        </div>

        {/* Popular Items */}
        <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900">{t('topDishes')}</h2>
              <p className="text-sm text-neutral-500">{t('mostOrdered')}</p>
            </div>
          </div>
          {popularItems.length > 0 ? (
            <div className="p-4 space-y-3">
              {popularItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-700'
                        : idx === 1
                          ? 'bg-neutral-200 text-neutral-700'
                          : idx === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                      <UtensilsCrossed className="w-5 h-5 text-neutral-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{item.name}</p>
                    <p className="text-xs text-neutral-500">
                      {t('ordersCountLabel', { count: item.order_count })}
                    </p>
                  </div>
                  <div className="w-16">
                    <MiniChart
                      data={getLast7DaysData(recentOrders)}
                      tooltipLabel={t('ordersCount')}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <UtensilsCrossed className="w-6 h-6 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500">{t('noDataAvailable')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          href={`${adminBase}/kitchen`}
          className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
            <ChefHat className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-900">{t('kitchenLabel')}</h3>
            <p className="text-xs text-neutral-500">{t('viewKdsSubtitle')}</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/orders`}
          className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-900">{t('ordersLabel')}</h3>
            <p className="text-xs text-neutral-500">{t('manageOrdersSubtitle')}</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/items`}
          className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
            <UtensilsCrossed className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-900">{t('dishesLabel')}</h3>
            <p className="text-xs text-neutral-500">{t('manageDishes')}</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/reports`}
          className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-xl hover:border-[#CCFF00] transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-[#CCFF00]/20 transition-colors">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-900">{t('reportsLabel')}</h3>
            <p className="text-xs text-neutral-500">{t('viewStats')}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
