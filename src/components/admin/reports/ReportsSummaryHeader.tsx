'use client';

import { useTranslations } from 'next-intl';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  DollarSign,
  ShoppingBag,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { TrendBadge } from './TrendBadge';
import { PERIOD_PILLS } from './reports.types';
import type { CurrencyFormatter, Period, ReportSummary } from './reports.types';

interface ReportsSummaryHeaderProps {
  fmt: CurrencyFormatter;
  period: Period;
  setPeriod: (p: Period) => void;
  summary: ReportSummary;
  revenueTrend: number;
  ordersTrend: number;
  basketTrend: number;
  exporting: boolean;
  exportingCsv: boolean;
  onExportCSV: () => void;
  onExportPDF: () => void;
}

export function ReportsSummaryHeader({
  fmt,
  period,
  setPeriod,
  summary,
  revenueTrend,
  ordersTrend,
  basketTrend,
  exporting,
  exportingCsv,
  onExportCSV,
  onExportPDF,
}: ReportsSummaryHeaderProps) {
  const t = useTranslations('reports');

  const kpis = [
    {
      key: 'revenue',
      Icon: DollarSign,
      accent: true,
      label: t('revenueLabel'),
      value: fmt(summary.revenue) as string | number,
      trend: revenueTrend,
    },
    {
      key: 'orders',
      Icon: ShoppingBag,
      accent: false,
      label: t('orders'),
      value: summary.orders as string | number,
      trend: ordersTrend,
    },
    {
      key: 'basket',
      Icon: CreditCard,
      accent: false,
      label: t('averageBasket'),
      value: fmt(summary.avgBasket) as string | number,
      trend: basketTrend,
    },
  ];

  return (
    <div className="shrink-0 space-y-4">
      <AdminPageHeader
        title={t('title')}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-app-border/50 text-xs h-8"
              onClick={onExportCSV}
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
              onClick={onExportPDF}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 mr-1.5" />
              )}
              PDF
            </Button>
          </>
        }
      />

      {/* -- Period pills -- */}
      <div className="flex items-center gap-1.5 md:gap-2.5 lg:gap-3 overflow-x-auto pb-0.5">
        {PERIOD_PILLS.map((pill) => (
          <Button
            key={pill.value}
            type="button"
            variant="outline"
            onClick={() => setPeriod(pill.value)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap h-auto',
              period === pill.value
                ? 'bg-app-text text-app-bg border-app-text shadow-sm'
                : 'bg-app-card text-app-text-secondary border-app-border/50 hover:border-app-border hover:bg-app-elevated',
            )}
          >
            {t(pill.labelKey)}
          </Button>
        ))}
      </div>

      {/* -- KPI Cards -- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {kpis.map(({ key, Icon, accent, label, value, trend }) => (
          <div
            key={key}
            className="bg-app-card border border-app-border/60 rounded-xl p-4 flex items-center gap-3"
          >
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                accent ? 'bg-accent/10 text-accent' : 'bg-app-elevated text-app-text-muted',
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-app-text-muted uppercase tracking-wide">
                {label}
              </p>
              <div className="flex items-end gap-2 mt-0.5">
                <p className="text-xl font-bold text-app-text tabular-nums leading-tight truncate">
                  {value}
                </p>
                <TrendBadge value={trend} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
