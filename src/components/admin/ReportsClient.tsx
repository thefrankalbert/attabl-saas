'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, BarChart3 } from 'lucide-react';
import { useReportData } from '@/hooks/queries';
import { useSessionState } from '@/hooks/useSessionState';
import { Button } from '@/components/ui/button';
import { formatCurrencyMinor } from '@/lib/utils/money';
import type { CurrencyCode } from '@/types/admin.types';

import type { Period } from '@/components/admin/reports/reports.types';
import { useReportExports } from '@/components/admin/reports/useReportExports';
import { ReportsSummaryHeader } from '@/components/admin/reports/ReportsSummaryHeader';
import { RevenueChartCard } from '@/components/admin/reports/RevenueChartCard';
import { TopProductsCard } from '@/components/admin/reports/TopProductsCard';
import { ProductRankingTable } from '@/components/admin/reports/ProductRankingTable';
import { CategoryBreakdownCard } from '@/components/admin/reports/CategoryBreakdownCard';
import { ServerPerformanceCard } from '@/components/admin/reports/ServerPerformanceCard';

// --- Types ----------------------------------------------

interface ReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

// --- Component ------------------------------------------

export default function ReportsClient({ tenantId, currency = 'XAF' }: ReportsClientProps) {
  const t = useTranslations('reports');
  // All report amounts (revenue, avg basket, avg order, daily/category/server
  // revenue, RPC sums of order.total + price_at_order) are integer MINOR units.
  const fmt = useCallback((amount: number) => formatCurrencyMinor(amount, currency), [currency]);
  const [period, setPeriod] = useSessionState<Period>('reports:period', '7d');
  // Hydration guard: useSessionState reads sessionStorage on the client, so the
  // first client render can pick a different branch than the server. Render the
  // loading branch until mounted so SSR and client-initial match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: reportData, isLoading: loading, error, refetch } = useReportData(tenantId, period);

  const dailyStats = reportData?.dailyStats ?? [];
  const topItems = reportData?.topItems ?? [];
  const categories = reportData?.categories ?? [];
  const serverStats = reportData?.serverStats ?? [];
  const summary = reportData?.summary ?? { revenue: 0, orders: 0, avgBasket: 0 };
  const previousSummary = reportData?.previousSummary ?? { revenue: 0, orders: 0, avgBasket: 0 };

  const periodDisplayLabel = useMemo(() => {
    const map: Record<Period, string> = {
      today: t('periodToday'),
      '7d': t('last7Days'),
      '30d': t('last30Days'),
      '90d': t('last90Days'),
      thisMonth: t('thisMonth'),
      lastMonth: t('lastMonth'),
      thisYear: t('thisYear'),
    };
    return map[period] ?? t('last7Days');
  }, [period, t]);

  const revenueTrend = useMemo(() => {
    const prev = previousSummary.revenue;
    if (prev === 0) return summary.revenue > 0 ? 100 : 0;
    return Math.round(((summary.revenue - prev) / prev) * 100);
  }, [summary.revenue, previousSummary.revenue]);

  const ordersTrend = useMemo(() => {
    const prev = previousSummary.orders;
    if (prev === 0) return summary.orders > 0 ? 100 : 0;
    return Math.round(((summary.orders - prev) / prev) * 100);
  }, [summary.orders, previousSummary.orders]);

  const basketTrend = useMemo(() => {
    const prev = previousSummary.avgBasket;
    if (prev === 0) return summary.avgBasket > 0 ? 100 : 0;
    return Math.round(((summary.avgBasket - prev) / prev) * 100);
  }, [summary.avgBasket, previousSummary.avgBasket]);

  // -- Export handlers -------------------------------------

  const { exporting, exportingCsv, handleExportPDF, handleExportCSV } = useReportExports({
    currency,
    fmt,
    periodDisplayLabel,
    summary,
    topItems,
    dailyStats,
    categories,
  });

  // -- Render ----------------------------------------------

  if (error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="w-10 h-10 text-app-text-muted mb-3" />
        <p className="text-sm text-status-error">{t('loadError')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (loading || !mounted)
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 text-app-text-muted animate-spin" />
        <p className="text-sm text-app-text-muted">{t('loadingReports')}</p>
      </div>
    );

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <ReportsSummaryHeader
        fmt={fmt}
        period={period}
        setPeriod={setPeriod}
        summary={summary}
        revenueTrend={revenueTrend}
        ordersTrend={ordersTrend}
        basketTrend={basketTrend}
        exporting={exporting}
        exportingCsv={exportingCsv}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {/* -- Scrollable content -- */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        <div className="space-y-4">
          {/* Chart & Top Items */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <RevenueChartCard
              dailyStats={dailyStats}
              periodDisplayLabel={periodDisplayLabel}
              fmt={fmt}
            />
            <TopProductsCard topItems={topItems} fmt={fmt} />
          </div>

          {/* Product Ranking Table */}
          {topItems.length > 0 && <ProductRankingTable topItems={topItems} fmt={fmt} />}

          {/* Category Breakdown + Server Performance side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CategoryBreakdownCard categories={categories} fmt={fmt} />
            <ServerPerformanceCard serverStats={serverStats} fmt={fmt} />
          </div>
        </div>
      </div>
    </div>
  );
}
