'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardStats } from '@/hooks/queries';
import { useUpdateOrderStatus } from '@/hooks/mutations';
import { useToast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';
import type {
  Order,
  DashboardStats,
  PopularItem,
  CurrencyCode,
  CategoryBreakdown,
  HourlyOrderCount,
  SparklinePoint,
} from '@/types/admin.types';

// --- Types -------------------------------------------------

interface StockItem {
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

// --- Hook --------------------------------------------------

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
  const { play: playNotification } = useSound();

  // Coalesce bursts of realtime events into a single refetch. During service the
  // dashboard receives hundreds of order/ingredient events per hour; without this,
  // each one would re-run the full 8-query bundle. A short debounce keeps the
  // dashboard fresh within ~1s of the last change while collapsing storms into one.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on the `online` event to rebuild the realtime channels (which die
  // silently during an outage) and refetch missed data on reconnect.
  const [reconnectTick, setReconnectTick] = useState(0);

  // TanStack Query for dashboard data - pass server-computed sparklines as initialData
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
        onSuccess: (data) => {
          // Offline: the change is durably queued, not yet server-confirmed.
          // Say so - a "updated" toast while the list still shows the old
          // status reads as a bug and invites duplicate taps.
          toast({ title: data.queued ? ta('statusQueued') : ta('statusUpdated') });
        },
        onError: () => {
          toast({ title: ta('statusUpdateError'), variant: 'destructive' });
        },
      },
    );
  };

  useEffect(() => {
    // Debounced refetch: schedule a single invalidation that fires once the event
    // burst settles. Repeated events within the window reset the timer, so N events
    // collapse into 1 refetch instead of N x 8 queries.
    const scheduleRefetch = (): void => {
      if (refetchTimerRef.current !== null) {
        clearTimeout(refetchTimerRef.current);
      }
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
      }, 800);
    };

    const channel = supabase
      .channel(`dashboard-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Notification is per-order (immediate); only the refetch is debounced.
          playNotification();
          scheduleRefetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          scheduleRefetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          scheduleRefetch();
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
          scheduleRefetch();
        },
      )
      .subscribe();

    // On network recovery the two channels above are dead; rebuild them (bump
    // the tick to re-run this effect) and refetch the data missed during the
    // outage. Without this the dashboard silently stops updating after a blip.
    const onOnline = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
      setReconnectTick((t) => t + 1);
    };
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('online', onOnline);
      if (refetchTimerRef.current !== null) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
      channel.unsubscribe();
      stockChannel.unsubscribe();
      supabase.removeChannel(channel);
      supabase.removeChannel(stockChannel);
    };
  }, [supabase, tenantId, queryClient, playNotification, reconnectTick]);

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
