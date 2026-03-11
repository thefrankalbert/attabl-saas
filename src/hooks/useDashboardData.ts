'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardStats } from '@/hooks/queries';
import { useUpdateOrderStatus } from '@/hooks/mutations';
import { useToast } from '@/components/ui/use-toast';
import type {
  Order,
  DashboardStats,
  PopularItem,
  CurrencyCode,
  CategoryBreakdown,
  HourlyOrderCount,
  SparklinePoint,
} from '@/types/admin.types';

// ─── Types ─────────────────────────────────────────────────

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
}

export interface UseDashboardDataParams {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userName?: string;
  initialStats: DashboardStats;
  initialRecentOrders: Order[];
  initialPopularItems: PopularItem[];
  initialRevenueSparkline?: SparklinePoint[];
  initialOrdersSparkline?: SparklinePoint[];
  currency?: CurrencyCode;
}

export interface UseDashboardDataReturn {
  stats: DashboardStats;
  recentOrders: Order[];
  stockItems: StockItem[];
  categoryBreakdown: CategoryBreakdown[];
  hourlyOrders: HourlyOrderCount[];
  revenueSparkline: SparklinePoint[];
  ordersSparkline: SparklinePoint[];
  itemsSparkline: SparklinePoint[];
  loading: boolean;
  handleStatusChange: (orderId: string, newStatus: string) => Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────

export function timeAgo(
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

export function getLast7DaysData(orders: Order[]): number[] {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  return days.map((day) => orders.filter((o) => o.created_at?.startsWith(day)).length);
}

// ─── Hook ──────────────────────────────────────────────────

export function useDashboardData({
  tenantId,
  initialStats,
  initialRecentOrders,
  initialRevenueSparkline = [],
  initialOrdersSparkline = [],
}: UseDashboardDataParams): UseDashboardDataReturn {
  const { toast } = useToast();
  const ta = useTranslations('admin');
  const supabase = createClient();
  const queryClient = useQueryClient();

  // TanStack Query for dashboard data — pass server-computed sparklines as initialData
  // so charts render immediately on first paint without waiting for client fetch
  const { data: dashboardData, isLoading: loading } = useDashboardStats(tenantId, {
    stats: initialStats,
    recentOrders: initialRecentOrders,
    stockItems: [],
    categoryBreakdown: [],
    hourlyOrders: [],
    revenueSparkline: initialRevenueSparkline,
    ordersSparkline: initialOrdersSparkline,
    itemsSparkline: [],
  });

  const stats = dashboardData?.stats ?? initialStats;
  const recentOrders = dashboardData?.recentOrders ?? initialRecentOrders;
  const stockItems = dashboardData?.stockItems ?? [];
  const categoryBreakdown = dashboardData?.categoryBreakdown ?? [];
  const hourlyOrders = dashboardData?.hourlyOrders ?? [];
  const revenueSparkline = dashboardData?.revenueSparkline ?? [];
  const ordersSparkline = dashboardData?.ordersSparkline ?? [];
  const itemsSparkline = dashboardData?.itemsSparkline ?? [];

  // Mutation for order status changes
  const updateOrderStatus = useUpdateOrderStatus(tenantId);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    updateOrderStatus.mutate(
      { orderId, status: newStatus },
      {
        onSuccess: () => {
          toast({ title: ta('statusUpdated') });
        },
        onError: () => {
          toast({ title: ta('statusUpdateError'), variant: 'destructive' });
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

  return {
    stats,
    recentOrders,
    stockItems,
    categoryBreakdown,
    hourlyOrders,
    revenueSparkline,
    ordersSparkline,
    itemsSparkline,
    loading,
    handleStatusChange,
  };
}
