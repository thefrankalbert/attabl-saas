'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { format, subDays, startOfDay, startOfMonth, subMonths, startOfYear } from 'date-fns';

type Period = '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear';

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

interface ReportData {
  dailyStats: DailyStats[];
  topItems: TopItem[];
  categories: CategoryBreakdown[];
  summary: { revenue: number; orders: number; avgBasket: number };
  previousSummary: { revenue: number; orders: number; avgBasket: number };
}

function getDateRange(p: Period) {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  switch (p) {
    case '7d':
      start = startOfDay(subDays(now, 6));
      break;
    case '30d':
      start = startOfDay(subDays(now, 29));
      break;
    case 'thisMonth':
      start = startOfMonth(now);
      break;
    case 'lastMonth': {
      const lastM = subMonths(now, 1);
      start = startOfMonth(lastM);
      end = startOfDay(startOfMonth(now));
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

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    prevStartDate: format(prevStart, 'yyyy-MM-dd'),
    prevEndDate: format(prevEnd, 'yyyy-MM-dd'),
  };
}

/**
 * Fetch report data using Supabase RPCs.
 * Matches the queries in ReportsClient loadData().
 */
export function useReportData(tenantId: string, period: Period) {
  return useQuery<ReportData>({
    queryKey: ['report-data', tenantId, period],
    queryFn: async () => {
      const supabase = createClient();
      const { startDate, endDate, prevStartDate, prevEndDate } = getDateRange(period);

      const [dailyRes, topRes, summaryRes, prevSummaryRes, categoryRes] = await Promise.all([
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
        supabase.rpc('get_category_breakdown', {
          p_tenant_id: tenantId,
          p_start_date: startDate,
          p_end_date: endDate,
        }),
      ]);

      // Graceful fallback if RPCs not deployed
      if (dailyRes.error || topRes.error || summaryRes.error) {
        return {
          dailyStats: [],
          topItems: [],
          categories: [],
          summary: { revenue: 0, orders: 0, avgBasket: 0 },
          previousSummary: { revenue: 0, orders: 0, avgBasket: 0 },
        };
      }

      // Process daily stats
      const rawDaily = (dailyRes.data || []) as {
        report_date: string;
        revenue: number;
        order_count: number;
      }[];
      const dailyStats = rawDaily.map((d) => ({
        date: d.report_date,
        revenue: Number(d.revenue) || 0,
        orders: Number(d.order_count) || 0,
      }));

      // Process top items
      const rawTop = (topRes.data || []) as {
        item_id: string;
        item_name: string;
        total_quantity: number;
        total_revenue: number;
      }[];
      const topItems = rawTop.map((t) => ({
        id: t.item_id,
        name: t.item_name,
        quantity: Number(t.total_quantity) || 0,
        revenue: Number(t.total_revenue) || 0,
      }));

      // Process summary
      const rawSummary = summaryRes.data as {
        total_revenue: number;
        total_orders: number;
        avg_basket: number;
      } | null;
      const summary = {
        revenue: Number(rawSummary?.total_revenue) || 0,
        orders: Number(rawSummary?.total_orders) || 0,
        avgBasket: Math.round(Number(rawSummary?.avg_basket) || 0),
      };

      // Previous period summary
      const rawPrev = prevSummaryRes.data as {
        total_revenue: number;
        total_orders: number;
        avg_basket: number;
      } | null;
      const previousSummary = {
        revenue: Number(rawPrev?.total_revenue) || 0,
        orders: Number(rawPrev?.total_orders) || 0,
        avgBasket: Math.round(Number(rawPrev?.avg_basket) || 0),
      };

      // Category breakdown
      let categories: CategoryBreakdown[] = [];
      if (!categoryRes.error && categoryRes.data) {
        const rawCats = (categoryRes.data || []) as {
          category_name: string;
          total_revenue: number;
        }[];
        const totalCatRevenue = rawCats.reduce((sum, c) => sum + (Number(c.total_revenue) || 0), 0);
        categories = rawCats.map((c) => ({
          category: c.category_name || 'Uncategorized',
          revenue: Number(c.total_revenue) || 0,
          percentage:
            totalCatRevenue > 0
              ? Math.round(((Number(c.total_revenue) || 0) / totalCatRevenue) * 100)
              : 0,
        }));
      }

      return { dailyStats, topItems, categories, summary, previousSummary };
    },
    enabled: !!tenantId,
  });
}
