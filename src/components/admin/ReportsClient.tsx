'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  DollarSign,
  ShoppingBag,
  CreditCard,
  ChevronRight,
  TrendingUp,
  TrendingDown,
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
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';

interface ReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

type Period = '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear';

interface DailyStats {
  date: string;
  revenue: number;
  orders: number;
}

const CHART_COLORS = [
  '#CCFF00',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

export default function ReportsClient({ tenantId, currency = 'XAF' }: ReportsClientProps) {
  const t = useTranslations('reports');
  const fmt = (amount: number) => formatCurrency(amount, currency);
  const [period, setPeriod] = useState<Period>('7d');
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const { toast } = useToast();

  // TanStack Query for report data
  const { data: reportData, isLoading: loading } = useReportData(tenantId, period);

  const dailyStats = reportData?.dailyStats ?? [];
  const topItems = reportData?.topItems ?? [];
  const categories = reportData?.categories ?? [];
  const serverStats = reportData?.serverStats ?? [];
  const summary = reportData?.summary ?? { revenue: 0, orders: 0, avgBasket: 0 };
  const previousSummary = reportData?.previousSummary ?? { revenue: 0, orders: 0, avgBasket: 0 };

  /** Compute a human-readable label for the active period */
  const periodDisplayLabel = useMemo(() => {
    switch (period) {
      case '7d':
        return t('last7Days');
      case '30d':
        return t('last30Days');
      case 'thisMonth':
        return t('thisMonth');
      case 'lastMonth':
        return t('lastMonth');
      case 'thisYear':
        return t('thisYear');
      default:
        return t('last7Days');
    }
  }, [period, t]);

  /** Compute percentage change between current and previous period */
  const trendPercent = useCallback((current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }, []);

  const revenueTrend = useMemo(
    () => trendPercent(summary.revenue, previousSummary.revenue),
    [summary.revenue, previousSummary.revenue, trendPercent],
  );
  const ordersTrend = useMemo(
    () => trendPercent(summary.orders, previousSummary.orders),
    [summary.orders, previousSummary.orders, trendPercent],
  );
  const basketTrend = useMemo(
    () => trendPercent(summary.avgBasket, previousSummary.avgBasket),
    [summary.avgBasket, previousSummary.avgBasket, trendPercent],
  );

  const handleExportPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.text(t('activityReport'), 20, 20);
      doc.setFontSize(10);
      doc.text(t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') }), 20, 28);
      doc.text(t('periodLabel', { period: periodDisplayLabel }), 20, 34);

      // Summary
      doc.setFillColor(245, 245, 245);
      doc.rect(20, 45, 170, 30, 'F');
      doc.setFontSize(12);
      doc.text(`${t('revenueLabel')} : ${fmt(summary.revenue)}`, 30, 65);
      doc.text(`${t('orders')} : ${summary.orders}`, 100, 65);
      doc.text(`${t('averageBasket')} : ${fmt(summary.avgBasket)}`, 150, 65);

      // Top Items
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
    } catch {
      toast({ title: t('exportPdfError'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    setExportingCsv(true);
    try {
      const rows: string[] = [];

      // Summary header
      rows.push(`${t('activityReport')} — ${periodDisplayLabel}`);
      rows.push(`${t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}`);
      rows.push('');

      // Summary row
      rows.push(`${t('revenueLabel')},${t('orders')},${t('averageBasket')}`);
      rows.push(`${summary.revenue},${summary.orders},${summary.avgBasket}`);
      rows.push('');

      // Daily stats
      rows.push(`Date,${t('revenueLabel')},${t('orders')}`);
      dailyStats.forEach((d) => {
        rows.push(`${d.date},${d.revenue},${d.orders}`);
      });
      rows.push('');

      // Top items
      rows.push(`${t('top5Products')}`);
      rows.push(`#,Name,${t('salesCount', { count: '' }).trim()},${t('revenueLabel')}`);
      topItems.forEach((item, i) => {
        rows.push(`${i + 1},"${item.name}",${item.quantity},${item.revenue}`);
      });

      // Category breakdown
      if (categories.length > 0) {
        rows.push('');
        rows.push(t('categoryBreakdown'));
        rows.push(`Category,${t('revenueLabel')},%`);
        categories.forEach((cat) => {
          rows.push(`"${cat.category}",${cat.revenue},${cat.percentage}%`);
        });
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
    } catch {
      toast({ title: t('exportCsvError'), variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  if (loading)
    return <div className="p-12 text-center text-neutral-500">{t('loadingReports')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('titleClient')}</h1>
          <p className="text-sm text-neutral-500">{t('subtitleClient')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v: string) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px] rounded-xl border-neutral-100 text-neutral-600 hover:bg-neutral-50">
              <SelectValue placeholder={t('selectPeriod')} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="7d">{t('last7Days')}</SelectItem>
              <SelectItem value="30d">{t('last30Days')}</SelectItem>
              <SelectItem value="thisMonth">{t('thisMonth')}</SelectItem>
              <SelectItem value="lastMonth">{t('lastMonth')}</SelectItem>
              <SelectItem value="thisYear">{t('thisYear')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="rounded-xl border-neutral-100"
            onClick={handleExportCSV}
            disabled={exportingCsv}
          >
            {exportingCsv ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            {t('exportCsv')}
          </Button>
          <Button
            variant="lime"
            className="rounded-xl"
            onClick={handleExportPDF}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('exportPdf')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Revenue — primary metric with lime accent */}
        <div className="p-6 bg-white border border-neutral-100 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#CCFF00]/20 text-black rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {t('revenueLabel')}
              </p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-neutral-900">{fmt(summary.revenue)}</p>
                {revenueTrend !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-semibold mb-1 ${
                      revenueTrend > 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {revenueTrend > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(revenueTrend)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">{t('vsLastPeriod')}</p>
            </div>
          </div>
        </div>
        {/* Orders */}
        <div className="p-6 bg-white border border-neutral-100 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-neutral-100 text-neutral-600 rounded-xl">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {t('orders')}
              </p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-neutral-900">{summary.orders}</p>
                {ordersTrend !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-semibold mb-1 ${
                      ordersTrend > 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {ordersTrend > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(ordersTrend)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">{t('vsLastPeriod')}</p>
            </div>
          </div>
        </div>
        {/* Average Basket */}
        <div className="p-6 bg-white border border-neutral-100 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-neutral-100 text-neutral-600 rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {t('averageBasket')}
              </p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-neutral-900">{fmt(summary.avgBasket)}</p>
                {basketTrend !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-semibold mb-1 ${
                      basketTrend > 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {basketTrend > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(basketTrend)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">{t('vsLastPeriod')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart & Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white border border-neutral-100 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold">{t('revenueEvolution')}</h3>
            <span className="text-xs text-neutral-400">{periodDisplayLabel}</span>
          </div>
          {dailyStats.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-neutral-400">{t('noData')}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={dailyStats.map((d) => ({
                  ...d,
                  label: format(new Date(d.date), 'dd/MM'),
                }))}
                margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#a3a3a3' }}
                  axisLine={{ stroke: '#e5e5e5' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#a3a3a3' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  labelStyle={{ color: '#a3a3a3', fontSize: 11 }}
                  formatter={(
                    value: number | undefined,
                    _name: string | undefined,
                    item: { payload?: DailyStats },
                  ) => [
                    `${fmt(value ?? 0)} — ${t('ordersCountShort', { count: item.payload?.orders ?? 0 })}`,
                    t('revenueLabel'),
                  ]}
                  cursor={{ fill: 'rgba(204, 255, 0, 0.08)' }}
                />
                <Bar dataKey="revenue" fill="#CCFF00" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Items Section */}
        <div className="bg-white border border-neutral-100 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-6">{t('top5Products')}</h3>
          <div className="space-y-4">
            {topItems.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-neutral-100 rounded-full text-xs font-bold text-neutral-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate group-hover:text-neutral-600 transition-colors">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {t('salesCount', { count: item.quantity })}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-neutral-900 tabular-nums">
                  {fmt(item.revenue)}
                </span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-8">{t('noData')}</p>
            )}
          </div>

          <Button
            variant="ghost"
            className="w-full mt-6 text-xs rounded-xl"
            onClick={() => toast({ title: t('comingSoon') })}
          >
            {t('viewAllRanking')} <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white border border-neutral-100 rounded-xl p-6">
        <h3 className="text-lg font-bold mb-6">{t('categoryBreakdown')}</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">{t('noCategories')}</p>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={260}>
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
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {categories.map((_cat, idx) => (
                    <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    fmt(value ?? 0),
                    name ?? '',
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-neutral-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Server Performance */}
      <div className="bg-white border border-neutral-100 rounded-xl p-6">
        <h3 className="text-lg font-bold mb-6">{t('serverPerformance')}</h3>
        {serverStats.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">{t('noServerData')}</p>
        ) : (
          <div className="space-y-6">
            {/* Horizontal bar chart — orders per server */}
            <ResponsiveContainer width="100%" height={Math.max(serverStats.length * 48, 120)}>
              <BarChart
                data={serverStats}
                layout="vertical"
                margin={{ top: 5, right: 30, bottom: 5, left: 5 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#a3a3a3' }}
                  axisLine={{ stroke: '#e5e5e5' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="serverName"
                  tick={{ fontSize: 12, fill: '#525252' }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  labelStyle={{ color: '#a3a3a3', fontSize: 11 }}
                  formatter={(value: number | undefined) => [`${value ?? 0}`, t('ordersCount')]}
                />
                <Bar dataKey="orders" fill="#CCFF00" radius={[0, 4, 4, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>

            {/* Summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="text-left py-3 px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {t('serverName')}
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {t('ordersCount')}
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {t('revenueLabel')}
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {t('avgOrderValue')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {serverStats.map((s) => (
                    <tr
                      key={s.serverName}
                      className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors"
                    >
                      <td className="py-3 px-2 font-medium text-neutral-900">{s.serverName}</td>
                      <td className="py-3 px-2 text-right tabular-nums text-neutral-700">
                        {s.orders}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-neutral-700">
                        {fmt(s.revenue)}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-neutral-700">
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
  );
}
