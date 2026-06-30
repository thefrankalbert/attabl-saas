'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import type {
  ChartDataPoint,
  ChartPeriod,
  CommandCenterAlert,
  CommandCenterGlobals,
  LocationStat,
  RecentOrder,
  Tenant,
} from '@/types/command-center.types';
import {
  bucketChart,
  bucketToday,
  bucketYesterday,
  buildAlerts,
  buildLocations,
  chartWindow,
  sumLocations,
  toMajorAmount,
  type DerivableOrder,
} from './command-center.derive';

const AUTO_REFRESH_MS = 60_000;

interface UseCommandCenterDataParams {
  baseTenants: Tenant[];
  logoBySlug: Map<string, string | null>;
  /**
   * True platform-wide tenant count, computed server-side. The loaded baseTenants
   * set is bounded for scalability, so the headline counters use these totals when
   * provided and fall back to the loaded set for small tenant counts.
   */
  serverTotalLocations?: number;
  /** True platform-wide count of active tenants, computed server-side. */
  serverActiveLocations?: number;
}

export interface CommandCenterData {
  loading: boolean;
  locations: LocationStat[];
  globals: CommandCenterGlobals;
  chartData: ChartDataPoint[];
  recentOrders: RecentOrder[];
  alerts: CommandCenterAlert[];
  error: boolean;
  isChartLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  fetchChartFor: (period: ChartPeriod) => Promise<void>;
}

interface RecentOrderRow extends DerivableOrder {
  tenants: { name: string; slug: string } | null;
}

export function useCommandCenterData(
  {
    baseTenants,
    logoBySlug,
    serverTotalLocations,
    serverActiveLocations,
  }: UseCommandCenterDataParams,
  currentPeriod: ChartPeriod,
): CommandCenterData {
  const supabase = useMemo(() => createClient(), []);
  const tAlerts = useTranslations('admin.tenants.commandCenter.alerts');

  // True platform totals (server-computed). Fall back to the loaded set when the
  // server did not provide them so behavior is identical for small tenant counts.
  const totalLocations = serverTotalLocations ?? baseTenants.length;
  const activeLocations = serverActiveLocations ?? baseTenants.filter((t) => t.is_active).length;

  const tenantIds = useMemo(() => baseTenants.map((t) => t.id), [baseTenants]);
  const tenantById = useMemo(() => {
    const map = new Map<string, Tenant>();
    baseTenants.forEach((t) => map.set(t.id, t));
    return map;
  }, [baseTenants]);

  const [loading, setLoading] = useState(baseTenants.length > 0);
  const [locations, setLocations] = useState<LocationStat[]>([]);
  const [globals, setGlobals] = useState<CommandCenterGlobals>(() => ({
    total_locations: totalLocations,
    active_locations: activeLocations,
    revenue_today: 0,
    revenue_yesterday: 0,
    orders_today: 0,
    orders_yesterday: 0,
    alerts_count: 0,
  }));
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [alerts, setAlerts] = useState<CommandCenterAlert[]>([]);
  const [error, setError] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const alertTranslators = useMemo(
    () => ({
      orderCancelled: (number: string) => tAlerts('orderCancelled', { number }),
      siteOffline: () => tAlerts('siteOffline'),
    }),
    [tAlerts],
  );

  const fetchAll = useCallback(async () => {
    if (tenantIds.length === 0) {
      setLoading(false);
      return;
    }
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    const [todayRes, yesterdayRes, recentRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total, status, created_at, tenant_id, display_currency')
        .in('tenant_id', tenantIds)
        .gte('created_at', startToday.toISOString()),
      supabase
        .from('orders')
        .select('id, total, status, tenant_id, created_at, display_currency')
        .in('tenant_id', tenantIds)
        .gte('created_at', startYesterday.toISOString())
        .lt('created_at', startToday.toISOString()),
      supabase
        .from('orders')
        .select(
          'id, order_number, total, status, created_at, tenant_id, display_currency, tenants(name, slug)',
        )
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    if (todayRes.error || yesterdayRes.error || recentRes.error) {
      logger.error(
        'command-center fetch failed',
        todayRes.error || yesterdayRes.error || recentRes.error,
        { scope: 'fetchAll', tenantCount: tenantIds.length },
      );
      setError(true);
      setLoading(false);
      return;
    }

    const todayOrders = (todayRes.data || []) as DerivableOrder[];
    const yesterdayOrders = (yesterdayRes.data || []) as DerivableOrder[];

    const today = bucketToday(todayOrders, tenantIds);
    const yesterday = bucketYesterday(yesterdayOrders, tenantIds);
    const sortedLocations = buildLocations(
      baseTenants,
      today,
      yesterday,
      logoBySlug,
      now.getHours(),
    );
    setLocations(sortedLocations);

    const allAlerts = buildAlerts(todayOrders, baseTenants, tenantById, alertTranslators, now);
    setAlerts(allAlerts);

    setGlobals({
      total_locations: totalLocations,
      active_locations: activeLocations,
      revenue_today: sumLocations(sortedLocations, 'revenue_today'),
      revenue_yesterday: sumLocations(sortedLocations, 'revenue_yesterday'),
      orders_today: sumLocations(sortedLocations, 'orders_today'),
      orders_yesterday: sumLocations(sortedLocations, 'orders_yesterday'),
      alerts_count: allAlerts.length,
    });

    const recentRaw = (recentRes.data || []) as unknown as RecentOrderRow[];
    setRecentOrders(
      recentRaw.map((o) => {
        const joined = o.tenants;
        return {
          id: o.id,
          order_number: o.order_number || ' - ',
          total: toMajorAmount(o),
          status: o.status || 'pending',
          created_at: o.created_at,
          tenant_name: joined?.name || tenantById.get(o.tenant_id)?.name || '',
          tenant_slug: joined?.slug || tenantById.get(o.tenant_id)?.slug || '',
        };
      }),
    );

    setError(false);
    setLoading(false);
  }, [
    supabase,
    tenantIds,
    baseTenants,
    logoBySlug,
    tenantById,
    alertTranslators,
    totalLocations,
    activeLocations,
  ]);

  const fetchChartFor = useCallback(
    async (period: ChartPeriod) => {
      if (tenantIds.length === 0) return;
      setIsChartLoading(true);
      const now = new Date();
      const { startDate, groupBy } = chartWindow(period, now);

      const { data, error: chartError } = await supabase
        .from('orders')
        .select('total, created_at, status, display_currency')
        .in('tenant_id', tenantIds)
        .gte('created_at', startDate.toISOString())
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (chartError) {
        logger.error('command-center fetch failed', chartError, {
          scope: 'fetchChart',
          tenantCount: tenantIds.length,
        });
        setError(true);
        setIsChartLoading(false);
        return;
      }

      setChartData(
        bucketChart(
          (data || []) as Array<Pick<DerivableOrder, 'total' | 'created_at' | 'display_currency'>>,
          startDate,
          now,
          groupBy,
        ),
      );
      setIsChartLoading(false);
    },
    [supabase, tenantIds],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchAll(), fetchChartFor(currentPeriod)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAll, fetchChartFor, currentPeriod]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    void fetchChartFor(currentPeriod);
  }, [fetchChartFor, currentPeriod]);

  // Keep a stable ref so the auto-refresh interval never closes over a stale
  // fetchAll while still firing the latest version.
  const fetchAllRef = useRef(fetchAll);
  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchAllRef.current();
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    loading,
    locations,
    globals,
    chartData,
    recentOrders,
    alerts,
    error,
    isChartLoading,
    isRefreshing,
    refresh,
    fetchChartFor,
  };
}
