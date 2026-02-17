'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2, DollarSign, ShoppingBag, CreditCard, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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
import { format, subDays, startOfDay } from 'date-fns';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';

interface ReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

type Period = '7d' | '30d' | '90d';

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

export default function ReportsClient({ tenantId, currency = 'XAF' }: ReportsClientProps) {
  const t = useTranslations('reports');
  const fmt = (amount: number) => formatCurrency(amount, currency);
  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, orders: 0, avgBasket: 0 });

  const { toast } = useToast();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = format(startOfDay(subDays(new Date(), days - 1)), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');

      // ─── Server-side RPCs (replaces client-side aggregation) ───
      const [dailyRes, topRes, summaryRes] = await Promise.all([
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
      ]);

      // Fallback: if RPCs not available yet, use empty data
      if (dailyRes.error || topRes.error || summaryRes.error) {
        console.warn('RPC fallback — RPCs may not be deployed yet', {
          daily: dailyRes.error?.message,
          top: topRes.error?.message,
          summary: summaryRes.error?.message,
        });

        // Graceful fallback with empty data
        setDailyStats([]);
        setTopItems([]);
        setSummary({ revenue: 0, orders: 0, avgBasket: 0 });
        return;
      }

      // Process daily stats (RPC returns { report_date, revenue, order_count })
      const rawDaily = (dailyRes.data || []) as {
        report_date: string;
        revenue: number;
        order_count: number;
      }[];
      setDailyStats(
        rawDaily.map((d) => ({
          date: d.report_date,
          revenue: Number(d.revenue) || 0,
          orders: Number(d.order_count) || 0,
        })),
      );

      // Process top items (RPC returns { item_id, item_name, total_quantity, total_revenue })
      const rawTop = (topRes.data || []) as {
        item_id: string;
        item_name: string;
        total_quantity: number;
        total_revenue: number;
      }[];
      setTopItems(
        rawTop.map((t) => ({
          id: t.item_id,
          name: t.item_name,
          quantity: Number(t.total_quantity) || 0,
          revenue: Number(t.total_revenue) || 0,
        })),
      );

      // Process summary (RPC returns { total_revenue, total_orders, avg_basket })
      const rawSummary = summaryRes.data as {
        total_revenue: number;
        total_orders: number;
        avg_basket: number;
      } | null;
      setSummary({
        revenue: Number(rawSummary?.total_revenue) || 0,
        orders: Number(rawSummary?.total_orders) || 0,
        avgBasket: Math.round(Number(rawSummary?.avg_basket) || 0),
      });
    } catch (e) {
      console.error(e);
      toast({ title: t('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, period, toast, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.text(t('activityReport'), 20, 20);
      doc.setFontSize(10);
      doc.text(t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') }), 20, 28);
      const periodLabel =
        period === '7d' ? t('last7Days') : period === '30d' ? t('last30Days') : t('last3Months');
      doc.text(t('periodLabel', { period: periodLabel }), 20, 34);

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

  const maxRevenue = useMemo(() => Math.max(...dailyStats.map((d) => d.revenue), 1), [dailyStats]);

  if (loading)
    return <div className="p-12 text-center text-neutral-500">{t('loadingReports')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('titleClient')}</h1>
          <p className="text-sm text-neutral-500">{t('subtitleClient')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t('last7Days')}</SelectItem>
              <SelectItem value="30d">{t('last30Days')}</SelectItem>
              <SelectItem value="90d">{t('last3Months')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Exporter
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-white border rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Chiffre d&apos;Affaires</p>
              <p className="text-2xl font-bold text-neutral-900">{fmt(summary.revenue)}</p>
            </div>
          </div>
        </div>
        <div className="p-6 bg-white border rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Volume Commandes</p>
              <p className="text-2xl font-bold text-neutral-900">{summary.orders}</p>
            </div>
          </div>
        </div>
        <div className="p-6 bg-white border rounded-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Panier Moyen</p>
              <p className="text-2xl font-bold text-neutral-900">{fmt(summary.avgBasket)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart & Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-6">Évolution des Revenus</h3>
          <div className="h-64 flex items-end gap-2">
            {dailyStats.map((day) => (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center gap-2 group relative"
              >
                <div
                  className="w-full bg-blue-500 rounded-t-sm transition-all hover:bg-blue-600 relative"
                  style={{ height: `${(day.revenue / maxRevenue) * 100}%` }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none">
                    {fmt(day.revenue)} ({day.orders} cmds)
                  </div>
                </div>
                <span className="text-[10px] text-neutral-400 rotate-0 truncate w-full text-center">
                  {format(new Date(day.date), 'dd/MM')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Items Section */}
        <div className="bg-white border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-6">Top Produits</h3>
          <div className="space-y-4">
            {topItems.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-neutral-100 rounded-full text-xs font-bold text-neutral-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate group-hover:text-primary transition-colors">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-500">{item.quantity} ventes</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-neutral-900 tabular-nums">
                  {fmt(item.revenue)}
                </span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-8">Aucune donnée disponible</p>
            )}
          </div>

          <Button
            variant="ghost"
            className="w-full mt-6 text-xs"
            onClick={() => toast({ title: 'Voir plus bientôt disponible' })}
          >
            Voir tout le classement <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
