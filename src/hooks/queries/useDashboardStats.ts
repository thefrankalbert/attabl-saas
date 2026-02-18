'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DashboardStats, Order } from '@/types/admin.types';

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
}

/**
 * Fetch dashboard stats: today's orders, revenue, active items, active venues,
 * recent orders with items, and low-stock ingredients.
 * Matches the queries in DashboardClient loadStats/loadRecentOrders/loadStock.
 */
export function useDashboardStats(tenantId: string, initialData?: DashboardData) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard-stats', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [ordersRes, itemsRes, venuesRes, recentRes, stockRes] = await Promise.all([
        // Today's orders for stats
        supabase
          .from('orders')
          .select('id, total_price, total')
          .eq('tenant_id', tenantId)
          .gte('created_at', today.toISOString()),
        // Active items count
        supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_available', true),
        // Active venues count
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        // Recent orders with items
        supabase
          .from('orders')
          .select(
            `id, table_number, status, total_price, total, created_at,
           order_items(id, quantity, price_at_order, menu_items(name))`,
          )
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(6),
        // Low stock items
        supabase
          .from('ingredients')
          .select('id, name, unit, current_stock, min_stock_alert')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('current_stock', { ascending: true })
          .limit(10),
      ]);

      const ordersData = ordersRes.data || [];
      const stats: DashboardStats = {
        ordersToday: ordersData.length,
        revenueToday: ordersData.reduce(
          (sum, o) =>
            sum +
            Number(
              (o as Record<string, unknown>).total_price ||
                (o as Record<string, unknown>).total ||
                0,
            ),
          0,
        ),
        activeItems: itemsRes.count || 0,
        activeCards: venuesRes.count || 0,
      };

      const recentOrders: Order[] = ((recentRes.data || []) as Record<string, unknown>[]).map(
        (order) => ({
          id: order.id as string,
          tenant_id: tenantId,
          table_number: (order.table_number as string) || 'N/A',
          status: ((order.status as string) || 'pending') as Order['status'],
          total_price: Number(order.total_price || order.total || 0),
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

      const stockItems = (stockRes.data as StockItem[]) || [];

      return { stats, recentOrders, stockItems };
    },
    enabled: !!tenantId,
    initialData,
  });
}
