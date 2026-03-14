'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  DollarSign,
  ShoppingBag,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useReportData } from '@/hooks/queries';
import { useSessionState } from '@/hooks/useSessionState';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import AnalyseTabs from '@/components/admin/AnalyseTabs';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';

import { CHART_PALETTE } from '@/lib/design-tokens';

// ─── Types ──────────────────────────────────────────────

interface ReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

type Period = 'today' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'thisYear';

interface DailyStats {
  date: string;
  revenue: number;
  orders: number;
}

const PERIOD_PILLS: { value: Period; labelKey: string }[] = [
  { value: 'today', labelKey: 'periodToday' },
  { value: '7d', labelKey: 'last7Days' },
  { value: '30d', labelKey: 'last30Days' },
  { value: '90d', labelKey: 'last90Days' },
];

// ─── CSV sanitizer (prevent formula injection) ──────────

function csvCell(value: string): string {
  const escaped = String(value).replace(/"/g, '""');
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped;
  return `"${safe}"`;
}

// ─── Trend badge ────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums',
        isUp
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400',
      )}
    >
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value)}%
    </span>
  );
}

// ─── Component ──────────────────────────────────────────

export default function ReportsClient({ tenantId, currency = 'XAF' }: ReportsClientProps) {
  const t = useTranslations('reports');
  const fmt = useCallback((amount: number) => formatCurrency(amount, currency), [currency]);
  const [period, setPeriod] = useSessionState<Period>('reports:period', '7d');
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const { toast } = useToast();

  const { data: reportData, isLoading: loading, error, refetch } = useReportData(tenantId, period);

  const dailyStats = reportData?.dailyStats ?? [];
  const topItems = reportData?.topItems ?? [];
  const categories = reportData?.categories ?? [];
  const serverStats = reportData?.serverStats ?? [];
  const summary = reportData?.summary ?? { revenue: 0, orders: 0, avgBasket: 0 };
  const previousSummary = reportData?.previousSummary ?? { revenue: 0, orders: 0, avgBasket: 0 };

  useEffect(() => {
    if (error) {
      toast({ title: t('loadError'), variant: 'destructive' });
    }
  }, [error, toast, t]);

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

  // ── Export handlers ─────────────────────────────────────

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      doc.setFontSize(20);
      doc.text(t('activityReport'), 20, 20);
      doc.setFontSize(10);
      doc.text(t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') }), 20, 28);
      doc.text(t('periodLabel', { period: periodDisplayLabel }), 20, 34);

      doc.setFillColor(245, 245, 245);
      doc.rect(20, 45, 170, 30, 'F');
      doc.setFontSize(12);
      doc.text(`${t('revenueLabel')} : ${fmt(summary.revenue)}`, 30, 65);
      doc.text(`${t('orders')} : ${summary.orders}`, 100, 65);
      doc.text(`${t('averageBasket')} : ${fmt(summary.avgBasket)}`, 150, 65);

      doc.setFontSize(14);
      doc.text(t('top5Products'), 20, 90);

      let y = 100;
      topItems.forEach((item, i) => {
        doc.setFontSize(12);
        doc.text(`${i + 1}. ${item.name}`, 20, y);
        doc.text(t('salesCount', { count: item.quantity }), 120, y);
        doc.text(`${fmt(item.revenue)}`, 160, y);
        y += 10;
      });

      doc.save(`rapport_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast({ title: t('pdfDownloaded') });
    } catch (err: unknown) {
      logger.error('Failed to export PDF report', err);
      toast({ title: t('exportPdfError'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    setExportingCsv(true);
    try {
      const rows: string[] = [];
      rows.push(`${t('activityReport')} — ${periodDisplayLabel}`);
      rows.push(`${t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}`);
      rows.push('');
      rows.push(`${t('revenueLabel')},${t('orders')},${t('averageBasket')}`);
      rows.push(`${summary.revenue},${summary.orders},${summary.avgBasket}`);
      rows.push('');
      rows.push(`Date,${t('revenueLabel')},${t('orders')}`);
      dailyStats.forEach((d) => rows.push(`${d.date},${d.revenue},${d.orders}`));
      rows.push('');
      rows.push(`${t('top5Products')}`);
      rows.push(`#,Name,${t('salesCount', { count: 0 })},${t('revenueLabel')}`);
      topItems.forEach((item, i) =>
        rows.push(`${i + 1},${csvCell(item.name)},${item.quantity},${item.revenue}`),
      );
      if (categories.length > 0) {
        rows.push('');
        rows.push(t('categoryBreakdown'));
        rows.push(`Category,${t('revenueLabel')},%`);
        categories.forEach((cat) =>
          rows.push(`${csvCell(cat.category)},${cat.revenue},${cat.percentage}%`),
        );
      }

      const csvContent = rows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rapport_${format(new Date(), 'yyyyMMdd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: t('csvDownloaded') });
    } catch (err: unknown) {
      logger.error('Failed to export CSV report', err);
      toast({ title: t('exportCsvError'), variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  // ── Render ──────────────────────────────────────────────

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <AnalyseTabs />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="w-10 h-10 text-app-text-muted mb-3" />
          <p className="text-sm text-red-600">{t('loadError')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <div className="h-full flex flex-col">
        <AnalyseTabs />
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 text-app-text-muted animate-spin" />
          <p className="text-sm text-app-text-muted">{t('loadingReports')}</p>
        </div>
      </div>
    );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AnalyseTabs />

        {/* ── Export buttons ── */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-app-border/50 text-xs h-8"
            onClick={handleExportCSV}
            disabled={exportingCsv}
          >
            {exportingCsv ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            )}
            CSV
          </Button>
          <Button
            variant="default"
            size="sm"
            className="rounded-lg text-xs h-8"
            onClick={handleExportPDF}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            PDF
          </Button>
        </div>

        {/* ── Period pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {PERIOD_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setPeriod(pill.value)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all border',
                period === pill.value
                  ? 'bg-app-text text-app-bg border-app-text shadow-sm'
                  : 'bg-app-card text-app-text-secondary border-app-border/50 hover:border-app-border hover:bg-app-elevated',
              )}
            >
              {t(pill.labelKey)}
            </button>
          ))}
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* Revenue */}
          <div className="px-3 py-2.5 bg-accent/5 border border-accent/10 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-accent shrink-0" />
              <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                {t('revenueLabel')}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-lg font-bold text-app-text tabular-nums leading-tight">
                {fmt(summary.revenue)}
              </p>
              <TrendBadge value={revenueTrend} />
            </div>
          </div>
          {/* Orders */}
          <div className="px-3 py-2.5 bg-app-elevated border border-app-border/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-app-text-muted shrink-0" />
              <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                {t('orders')}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-lg font-bold text-app-text tabular-nums leading-tight">
                {summary.orders}
              </p>
              <TrendBadge value={ordersTrend} />
            </div>
          </div>
          {/* Average Basket */}
          <div className="px-3 py-2.5 bg-app-elevated border border-app-border/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-app-text-muted shrink-0" />
              <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                {t('averageBasket')}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-lg font-bold text-app-text tabular-nums leading-tight">
                {fmt(summary.avgBasket)}
              </p>
              <TrendBadge value={basketTrend} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        <div className="space-y-4">
          {/* Chart & Top Items */}
          <div className="grid grid-cols-1 @lg:grid-cols-3 gap-3">
            {/* Revenue chart */}
            <div className="@lg:col-span-2 bg-app-card border border-app-border/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-app-text-muted" />
                  <h3 className="text-sm font-bold text-app-text">{t('revenueEvolution')}</h3>
                </div>
                <span className="text-[10px] font-medium text-app-text-muted bg-app-elevated px-2 py-0.5 rounded-md">
                  {periodDisplayLabel}
                </span>
              </div>
              {dailyStats.length === 0 ? (
                <div className="h-52 flex items-center justify-center">
                  <p className="text-sm text-app-text-muted">{t('noData')}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={dailyStats.map((d) => ({
                      ...d,
                      label: format(new Date(d.date), 'dd/MM'),
                    }))}
                    margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                  >
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
                      axisLine={{ stroke: 'var(--app-border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => fmt(v)}
                      width={65}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--app-elevated)',
                        border: '1px solid var(--app-border)',
                        borderRadius: '8px',
                        color: 'var(--app-text)',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--app-text-muted)', fontSize: 11 }}
                      formatter={(
                        value: number | undefined,
                        _name: string | undefined,
                        item: { payload?: DailyStats },
                      ) => [
                        `${fmt(value ?? 0)} — ${t('ordersCountShort', { count: item.payload?.orders ?? 0 })}`,
                        t('revenueLabel'),
                      ]}
                      cursor={{ fill: 'var(--app-accent-muted)' }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top 5 products */}
            <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
              <h3 className="text-sm font-bold text-app-text mb-4">{t('top5Products')}</h3>
              <div className="space-y-3">
                {topItems.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold',
                          index === 0
                            ? 'bg-accent/15 text-accent'
                            : 'bg-app-elevated text-app-text-muted',
                        )}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-app-text truncate">{item.name}</p>
                        <p className="text-[10px] text-app-text-muted">
                          {t('salesCount', { count: item.quantity })}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-app-text tabular-nums shrink-0 ml-2">
                      {fmt(item.revenue)}
                    </span>
                  </div>
                ))}
                {topItems.length === 0 && (
                  <p className="text-sm text-app-text-muted text-center py-6">{t('noData')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Product Ranking Table */}
          {topItems.length > 0 && (
            <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
              <h3 className="text-sm font-bold text-app-text mb-3">{t('productRanking')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border/60">
                      <th className="text-left py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                        #
                      </th>
                      <th className="text-left py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                        {t('productName')}
                      </th>
                      <th className="text-right py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                        {t('ordersCount')}
                      </th>
                      <th className="text-right py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                        {t('revenueLabel')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((item, index) => (
                      <tr
                        key={item.id}
                        className="border-b border-app-border/30 hover:bg-app-elevated/50 transition-colors"
                      >
                        <td className="py-2.5 px-2 tabular-nums text-app-text-muted font-bold text-xs">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-2 font-medium text-app-text text-sm">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-app-text-secondary text-sm">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-app-text font-semibold text-sm">
                          {fmt(item.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Category Breakdown + Server Performance side by side */}
          <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
            {/* Category Breakdown */}
            <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
              <h3 className="text-sm font-bold text-app-text mb-4">{t('categoryBreakdown')}</h3>
              {categories.length === 0 ? (
                <p className="text-sm text-app-text-muted text-center py-6">{t('noCategories')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categories.map((cat) => ({
                        name: cat.category,
                        value: cat.revenue,
                        percentage: cat.percentage,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {categories.map((_cat, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--app-elevated)',
                        border: '1px solid var(--app-border)',
                        borderRadius: '8px',
                        color: 'var(--app-text)',
                        fontSize: 12,
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        fmt(value ?? 0),
                        name ?? '',
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={6}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-app-text-secondary">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Server Performance */}
            <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-app-text-muted" />
                <h3 className="text-sm font-bold text-app-text">{t('serverPerformance')}</h3>
              </div>
              {serverStats.length === 0 ? (
                <p className="text-sm text-app-text-muted text-center py-6">{t('noServerData')}</p>
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={Math.max(serverStats.length * 40, 100)}>
                    <BarChart
                      data={serverStats}
                      layout="vertical"
                      margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
                        axisLine={{ stroke: 'var(--app-border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="serverName"
                        tick={{ fontSize: 11, fill: 'var(--app-text-secondary)' }}
                        axisLine={false}
                        tickLine={false}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--app-elevated)',
                          border: '1px solid var(--app-border)',
                          borderRadius: '8px',
                          color: 'var(--app-text)',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--app-text-muted)', fontSize: 11 }}
                        formatter={(value: number | undefined) => [
                          `${value ?? 0}`,
                          t('ordersCount'),
                        ]}
                      />
                      <Bar
                        dataKey="orders"
                        fill="var(--accent)"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Compact server table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-app-border/60">
                          <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                            {t('serverName')}
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                            {t('ordersCount')}
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                            {t('revenueLabel')}
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                            {t('avgOrderValue')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {serverStats.map((s) => (
                          <tr
                            key={s.serverName}
                            className="border-b border-app-border/30 hover:bg-app-elevated/50 transition-colors"
                          >
                            <td className="py-2 px-2 font-medium text-app-text text-sm">
                              {s.serverName}
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums text-app-text-secondary">
                              {s.orders}
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums text-app-text font-semibold">
                              {fmt(s.revenue)}
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums text-app-text-secondary">
                              {fmt(s.avgOrder)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
