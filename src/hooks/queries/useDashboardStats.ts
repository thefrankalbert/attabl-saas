'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import type {
  DashboardStats,
  Order,
  CategoryBreakdown,
  HourlyOrderCount,
  SparklinePoint,
} from '@/types/admin.types';

interface StockItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentOrders: Order[];
  stockItems: StockItem[];
  categoryBreakdown: CategoryBreakdown[];
  hourlyOrders: HourlyOrderCount[];
  revenueSparkline: SparklinePoint[];
  ordersSparkline: SparklinePoint[];
  itemsSparkline: SparklinePoint[];
}

/** Safely execute a Supabase query, returning null on failure instead of throwing. */
async function safeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown; count?: number | null }>,
  label: string,
): Promise<{ data: T | null; count: number | null }> {
  try {
    const res = await queryFn();
    if (res.error) {
      logger.warn(`[Dashboard] Query "${label}" failed`, { error: res.error });
      return { data: null, count: null };
    }
    return { data: res.data, count: (res.count as number) ?? null };
  } catch (err) {
    logger.warn(`[Dashboard] Query "${label}" threw`, { error: err });
    return { data: null, count: null };
  }
}

/**
 * Fetch dashboard stats: today's orders, revenue, active items, active venues,
 * recent orders with items, and low-stock ingredients.
 *
 * Each query is isolated so a single failure cannot block other charts from loading.
 */
export function useDashboardStats(tenantId: string, initialData?: DashboardData) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard-stats', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // ── Fire all queries in parallel with individual error isolation ──
      const [ordersRes, itemsRes, venuesRes, recentRes, stockRes, yesterdayRes, weekRes] =
        await Promise.all([
          // Today's orders for stats
          safeQuery(
            () =>
              supabase
                .from('orders')
                .select('id, total, tip_amount, status, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', today.toISOString()),
            'todayOrders',
          ),
          // Active items count
          safeQuery(
            () =>
              supabase
                .from('menu_items')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('is_available', true),
            'activeItems',
          ),
          // Active venues count
          safeQuery(
            () =>
              supabase
                .from('venues')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('is_active', true),
            'activeVenues',
          ),
          // Recent orders with items
          safeQuery(
            () =>
              supabase
                .from('orders')
                .select(
                  `id, order_number, table_number, status, total, tip_amount, created_at,
                 order_items(id, quantity, price_at_order, menu_items(name))`,
                )
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(12),
            'recentOrders',
          ),
          // Low stock items
          safeQuery(
            () =>
              supabase
                .from('ingredients')
                .select('id, name, unit, current_stock, min_stock_alert')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .order('current_stock', { ascending: true })
                .limit(10),
            'stockItems',
          ),
          // Yesterday's orders for trend comparison
          safeQuery(
            () =>
              supabase
                .from('orders')
                .select('id, total, tip_amount, status')
                .eq('tenant_id', tenantId)
                .gte('created_at', yesterday.toISOString())
                .lt('created_at', today.toISOString()),
            'yesterdayOrders',
          ),
          // Last 7 days for sparklines
          safeQuery(
            () =>
              supabase
                .from('orders')
                .select('id, total, tip_amount, created_at, status')
                .eq('tenant_id', tenantId)
                .gte('created_at', sevenDaysAgo.toISOString()),
            'weekOrders',
          ),
        ]);

      // Category query is non-critical - fire separately so it never blocks core data
      const categoryRes = await safeQuery(
        () =>
          supabase
            .from('order_items')
            .select(
              'quantity, price_at_order, menu_items!inner(categories!inner(name)), orders!inner(tenant_id)',
            )
            .eq('orders.tenant_id', tenantId),
        'categoryBreakdown',
      );

      // ── Build stats from isolated results ──
      const ordersData = (ordersRes.data || []) as Array<Record<string, unknown>>;
      const stats: DashboardStats = {
        ordersToday: ordersData.length,
        revenueToday: ordersData
          .filter((o) => o.status === 'delivered')
          .reduce((sum, o) => sum + Number(o.total || 0) + Number(o.tip_amount || 0), 0),
        activeItems: itemsRes.count || 0,
        activeCards: venuesRes.count || 0,
      };

      const recentOrders: Order[] = ((recentRes.data || []) as Record<string, unknown>[]).map(
        (order) => ({
          id: order.id as string,
          tenant_id: tenantId,
          order_number: (order.order_number as string) || undefined,
          table_number: (order.table_number as string) || 'N/A',
          status: ((order.status as string) || 'pending') as Order['status'],
          total_price: Number(order.total || 0),
          tip_amount: Number(order.tip_amount || 0),
          created_at: order.created_at as string,
          items: ((order.order_items as Array<Record<string, unknown>>) || []).map(
            (item: Record<string, unknown>) => ({
              id: item.id as string,
              name: ((item.menu_items as Record<string, unknown>)?.name as string) || 'Unknown',
              quantity: item.quantity as number,
              price: item.price_at_order as number,
            }),
          ),
        }),
      );

      const stockItems = ((stockRes.data as StockItem[]) || []) as StockItem[];

      // ── Trend calculations ──
      const yesterdayOrders = (yesterdayRes.data || []) as Array<Record<string, unknown>>;
      const yesterdayRevenue = yesterdayOrders
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total || 0) + Number(o.tip_amount || 0), 0);
      const yesterdayCount = yesterdayOrders.length;

      if (yesterdayCount > 0) {
        stats.ordersTrend = Math.round(
          ((stats.ordersToday - yesterdayCount) / yesterdayCount) * 100,
        );
      }
      if (yesterdayRevenue > 0) {
        stats.revenueTrend = Math.round(
          ((stats.revenueToday - yesterdayRevenue) / yesterdayRevenue) * 100,
        );
      }

      // ── Sparklines: group 7-day orders by date ──
      const weekOrders = (weekRes.data || []) as Array<Record<string, unknown>>;
      const dayBuckets: Record<string, { revenue: number; count: number }> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().slice(0, 10);
        dayBuckets[key] = { revenue: 0, count: 0 };
      }
      for (const o of weekOrders) {
        const key = (o.created_at as string)?.slice(0, 10);
        if (key && dayBuckets[key]) {
          dayBuckets[key].count++;
          dayBuckets[key].revenue += Number(o.total || 0) + Number(o.tip_amount || 0);
        }
      }
      const bucketValues = Object.values(dayBuckets);
      const revenueSparkline: SparklinePoint[] = bucketValues.map((b) => ({
        value: b.revenue,
      }));
      const ordersSparkline: SparklinePoint[] = bucketValues.map((b) => ({
        value: b.count,
      }));
      const itemsSparkline: SparklinePoint[] = []; // No per-day item count available

      // ── Hourly orders: group today's orders by hour ──
      const hourlyMap: Record<number, number> = {};
      for (let h = 8; h <= 22; h++) hourlyMap[h] = 0;
      for (const o of ordersData) {
        if (o.created_at) {
          const hour = new Date(o.created_at as string).getHours();
          if (hourlyMap[hour] !== undefined) hourlyMap[hour]++;
        }
      }
      const hourlyOrders: HourlyOrderCount[] = Object.entries(hourlyMap).map(([h, count]) => ({
        hour: `${h}h`,
        count,
      }));

      // ── Category breakdown (non-critical) ──
      const categoryMap: Record<string, number> = {};
      const categoryItems = (categoryRes.data || []) as Array<Record<string, unknown>>;
      for (const item of categoryItems) {
        const menuItem = item.menu_items as Record<string, unknown> | null;
        const category = menuItem?.categories as Record<string, unknown> | null;
        const name = (category?.name as string) || 'Autres';
        const revenue = Number(item.quantity || 0) * Number(item.price_at_order || 0);
        categoryMap[name] = (categoryMap[name] || 0) + revenue;
      }
      const DONUT_COLORS = ['#2e7d32', '#F59E0B', '#3B82F6', '#D4D4D8'];
      const sortedCategories = Object.entries(categoryMap).sort(([, a], [, b]) => b - a);
      const top3 = sortedCategories.slice(0, 3);
      const othersValue = sortedCategories.slice(3).reduce((sum, [, v]) => sum + v, 0);
      const categoryBreakdown: CategoryBreakdown[] = top3.map(([name, value], i) => ({
        name,
        value,
        color: DONUT_COLORS[i],
      }));
      if (othersValue > 0) {
        categoryBreakdown.push({
          name: 'Autres',
          value: othersValue,
          color: DONUT_COLORS[3],
        });
      }

      return {
        stats,
        recentOrders,
        stockItems,
        categoryBreakdown,
        hourlyOrders,
        revenueSparkline,
        ordersSparkline,
        itemsSparkline,
      };
    },
    enabled: !!tenantId,
    initialData,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
