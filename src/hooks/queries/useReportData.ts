'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { subDays, startOfDay, endOfDay, startOfMonth, subMonths, startOfYear } from 'date-fns';
import { logger } from '@/lib/logger';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

type Period = 'today' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'thisYear';

interface DailyStats {
  date: string;
  revenue: number;
  orders: number;
}

interface TopItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface CategoryBreakdown {
  category: string;
  revenue: number;
  percentage: number;
}

interface ServerStats {
  serverName: string;
  orders: number;
  revenue: number;
  avgOrder: number;
}

interface ReportData {
  dailyStats: DailyStats[];
  topItems: TopItem[];
  categories: CategoryBreakdown[];
  serverStats: ServerStats[];
  summary: { revenue: number; orders: number; avgBasket: number };
  previousSummary: { revenue: number; orders: number; avgBasket: number };
}

export function getDateRange(p: Period) {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  switch (p) {
    case 'today':
      start = startOfDay(now);
      break;
    case '7d':
      start = startOfDay(subDays(now, 6));
      break;
    case '30d':
      start = startOfDay(subDays(now, 29));
      break;
    case '90d':
      start = startOfDay(subDays(now, 89));
      break;
    case 'thisMonth':
      start = startOfMonth(now);
      break;
    case 'lastMonth': {
      const lastM = subMonths(now, 1);
      start = startOfMonth(lastM);
      // Whole last day of last month, up to 23:59:59.999 local.
      end = endOfDay(subDays(startOfMonth(now), 1));
      break;
    }
    case 'thisYear':
      start = startOfYear(now);
      break;
    default:
      start = startOfDay(subDays(now, 6));
  }

  const daysDiff = Math.max(
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    1,
  );
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = startOfDay(subDays(prevEnd, daysDiff - 1));

  // Serialize as absolute UTC instants. The boundaries are computed in the
  // browser's local timezone - which is the restaurant's timezone - so the
  // instant is correct. Previously we emitted offset-less 'yyyy-MM-ddT00:00:00'
  // strings, which Postgres (TIMESTAMPTZ, UTC session) read as UTC - shifting
  // every window by the local offset (e.g. ~1h in Cameroon UTC+1), so "today"
  // dropped 00:00-01:00 local orders and leaked the next day's early orders,
  // and daily totals never reconciled against a drawer closed at local midnight.
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    prevStartDate: prevStart.toISOString(),
    prevEndDate: prevEnd.toISOString(),
  };
}

/**
 * Normalize the get_order_summary RPC result into the summary shape.
 * get_order_summary is a RETURNS TABLE function, so supabase-js returns `data`
 * as an array of rows ([{ total_revenue, ... }]) - reading it as a bare object
 * yields undefined for every field and silently zeroes the KPI cards. Read the
 * first row; tolerate a bare object in case a caller ever uses .single().
 */
export function parseOrderSummary(data: unknown): {
  revenue: number;
  orders: number;
  avgBasket: number;
} {
  const row = (Array.isArray(data) ? data[0] : data) as {
    total_revenue?: number;
    total_orders?: number;
    avg_basket?: number;
  } | null;
  return {
    revenue: Number(row?.total_revenue) || 0,
    orders: Number(row?.total_orders) || 0,
    avgBasket: Math.round(Number(row?.avg_basket) || 0),
  };
}

/**
 * Fetch report data using Supabase RPCs.
 * Matches the queries in ReportsClient loadData().
 */
export function useReportData(tenantId: string, period: Period) {
  const queryClient = useQueryClient();

  const query = useQuery<ReportData>({
    queryKey: ['report-data', tenantId, period],
    queryFn: async () => {
      const supabase = createClient();
      const { startDate, endDate, prevStartDate, prevEndDate } = getDateRange(period);

      let dailyRes, topRes, summaryRes, prevSummaryRes;
      try {
        [dailyRes, topRes, summaryRes, prevSummaryRes] = await Promise.all([
          supabase.rpc('get_daily_revenue', {
            p_tenant_id: tenantId,
            p_start_date: startDate,
            p_end_date: endDate,
          }),
          supabase.rpc('get_top_items', {
            p_tenant_id: tenantId,
            p_start_date: startDate,
            p_end_date: endDate,
            p_limit: 5,
          }),
          supabase.rpc('get_order_summary', {
            p_tenant_id: tenantId,
            p_start_date: startDate,
            p_end_date: endDate,
          }),
          supabase.rpc('get_order_summary', {
            p_tenant_id: tenantId,
            p_start_date: prevStartDate,
            p_end_date: prevEndDate,
          }),
        ]);
      } catch (err) {
        logger.error('Failed to fetch report data', err);
        throw err;
      }

      // Throw on RPC failure so React Query can surface the error
      const rpcError = dailyRes.error || topRes.error || summaryRes.error || prevSummaryRes.error;
      if (rpcError) {
        logger.error('RPC failure in report data', rpcError);
        throw rpcError;
      }

      // Category breakdown + server stats - aggregated server-side (RPC) so the
      // payload is proportional to categories/servers, not order volume. Both
      // independent, run in parallel.
      const [categoryRes, serverRes] = await Promise.all([
        supabase.rpc('get_category_breakdown', {
          p_tenant_id: tenantId,
          p_start_date: startDate,
          p_end_date: endDate,
        }),
        supabase.rpc('get_server_performance', {
          p_tenant_id: tenantId,
          p_start_date: startDate,
          p_end_date: endDate,
        }),
      ]);

      // Process daily stats (RPC returns: day, revenue, order_count)
      const rawDaily = (dailyRes.data || []) as {
        day: string;
        revenue: number;
        order_count: number;
      }[];
      const dailyStats = rawDaily.map((d) => ({
        date: d.day,
        revenue: Number(d.revenue) || 0,
        orders: Number(d.order_count) || 0,
      }));

      // Process top items (RPC returns: item_id, item_name, quantity_sold, revenue)
      const rawTop = (topRes.data || []) as {
        item_id: string;
        item_name: string;
        quantity_sold: number;
        revenue: number;
      }[];
      const topItems = rawTop.map((t) => ({
        id: t.item_id,
        name: t.item_name,
        quantity: Number(t.quantity_sold) || 0,
        revenue: Number(t.revenue) || 0,
      }));

      // Process summary + previous period. get_order_summary is a RETURNS TABLE
      // RPC, so supabase-js returns `data` as an array of rows ([{...}]), not a
      // single object - parseOrderSummary reads the first row.
      const summary = parseOrderSummary(summaryRes.data);
      const previousSummary = parseOrderSummary(prevSummaryRes.data);

      // Category breakdown (RPC returns: category, revenue - ordered by revenue).
      // Percentages are cheap client-side math over a handful of rows.
      let categories: CategoryBreakdown[] = [];
      if (!categoryRes.error && categoryRes.data) {
        const rows = categoryRes.data as { category: string; revenue: number }[];
        const totalCatRevenue = rows.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
        categories = rows.map((r) => {
          const revenue = Number(r.revenue) || 0;
          return {
            category: r.category,
            revenue,
            percentage: totalCatRevenue > 0 ? Math.round((revenue / totalCatRevenue) * 100) : 0,
          };
        });
      }

      // Server performance (RPC returns: server_id, server_name, orders, revenue
      // - ordered by orders desc). avgOrder is cheap client-side math.
      let serverStats: ServerStats[] = [];
      if (!serverRes.error && serverRes.data) {
        const rows = serverRes.data as {
          server_id: string;
          server_name: string;
          orders: number;
          revenue: number;
        }[];
        serverStats = rows.map((s) => {
          const orders = Number(s.orders) || 0;
          const revenue = Number(s.revenue) || 0;
          return {
            serverName: s.server_name,
            orders,
            revenue,
            avgOrder: orders > 0 ? Math.round(revenue / orders) : 0,
          };
        });
      }

      return { dailyStats, topItems, categories, serverStats, summary, previousSummary };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });

  // Keep reports fresh during service, like the dashboard. A sale (orders
  // INSERT) or a payment/status flip (orders UPDATE - payment_status is an
  // orders column) invalidates the report bundle. Debounced because the RPC
  // bundle is heavy, so a burst of orders collapses into a single refetch.
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      queryClient.invalidateQueries({ queryKey: ['report-data', tenantId] });
    }, 800);
  }, [queryClient, tenantId]);

  useEffect(
    () => () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    },
    [],
  );

  useRealtimeSubscription({
    channelName: `reports_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    event: '*',
    onChange: scheduleInvalidate,
    enabled: !!tenantId,
  });

  return query;
}
