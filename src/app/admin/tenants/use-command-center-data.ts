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
} from './command-center.derive';
import {
  createCommandCenterService,
  type CommandCenterChart,
  type CommandCenterOverview,
} from '@/services/command-center.service';

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
  /**
   * Super administrateur: les chiffres passent par la route serveur
   * /api/admin/command-center (service_role apres requireSuperAdmin), car la RLS
   * de `orders` ne lui ouvre que ses propres restaurants (revue L017, A19).
   * Proprietaire: lecture directe avec sa session, bornee a ses restaurants.
   */
  superAdmin: boolean;
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
}

async function fetchFromPlatformRoute<T>(body: unknown): Promise<T> {
  const res = await fetch('/api/admin/command-center', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`command-center route ${res.status}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

export function useCommandCenterData(
  {
    baseTenants,
    logoBySlug,
    serverTotalLocations,
    serverActiveLocations,
    superAdmin,
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

  const loadOverview = useCallback(
    (todayStart: string, yesterdayStart: string): Promise<CommandCenterOverview> =>
      superAdmin
        ? fetchFromPlatformRoute<CommandCenterOverview>({
            kind: 'overview',
            tenantIds,
            todayStart,
            yesterdayStart,
          })
        : createCommandCenterService(supabase).loadOverview(tenantIds, todayStart, yesterdayStart),
    [superAdmin, supabase, tenantIds],
  );

  const loadChart = useCallback(
    (start: string): Promise<CommandCenterChart> =>
      superAdmin
        ? fetchFromPlatformRoute<CommandCenterChart>({ kind: 'chart', tenantIds, start })
        : createCommandCenterService(supabase).loadChart(tenantIds, start),
    [superAdmin, supabase, tenantIds],
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

    let overview: CommandCenterOverview;
    try {
      overview = await loadOverview(startToday.toISOString(), startYesterday.toISOString());
    } catch (err) {
      logger.error('command-center fetch failed', err, {
        scope: 'fetchAll',
        tenantCount: tenantIds.length,
      });
      setError(true);
      setLoading(false);
      return;
    }
    const { todayOrders, yesterdayOrders, todayPayments, yesterdayPayments } = overview;

    const today = bucketToday(todayOrders, todayPayments, tenantIds);
    const yesterday = bucketYesterday(yesterdayOrders, yesterdayPayments, tenantIds);
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

    setRecentOrders(
      overview.recentOrders.map((o) => {
        const joined = o.tenants;
        return {
          id: o.id,
          order_number: o.order_number || ' - ',
          total: toMajorAmount(o),
          status: o.status || 'pending',
          created_at: o.created_at,
          tenant_name: joined?.name || tenantById.get(o.tenant_id)?.name || '',
          tenant_slug: joined?.slug || tenantById.get(o.tenant_id)?.slug || '',
          currency: o.display_currency ?? null,
        };
      }),
    );

    setError(false);
    setLoading(false);
  }, [
    loadOverview,
    tenantIds,
    baseTenants,
    logoBySlug,
    tenantById,
    alertTranslators,
    totalLocations,
    activeLocations,
  ]);

  // Garde de requete (revue L017, A20): seule la DERNIERE demande de graphique
  // ecrit l'etat. Sans elle, la reponse tardive d'une periode precedente
  // ("mois") ecrasait le graphique de la periode choisie ("jour").
  const chartRequestRef = useRef(0);

  const fetchChartFor = useCallback(
    async (period: ChartPeriod) => {
      if (tenantIds.length === 0) return;
      const requestId = ++chartRequestRef.current;
      setIsChartLoading(true);
      const now = new Date();
      const { startDate, groupBy } = chartWindow(period, now);

      let chart: CommandCenterChart;
      try {
        chart = await loadChart(startDate.toISOString());
      } catch (err) {
        if (requestId !== chartRequestRef.current) return;
        logger.error('command-center fetch failed', err, {
          scope: 'fetchChart',
          tenantCount: tenantIds.length,
        });
        setError(true);
        setIsChartLoading(false);
        return;
      }
      if (requestId !== chartRequestRef.current) return;

      setChartData(bucketChart(chart.payments, chart.orders, startDate, now, groupBy));
      setIsChartLoading(false);
    },
    [loadChart, tenantIds],
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
  };
}
