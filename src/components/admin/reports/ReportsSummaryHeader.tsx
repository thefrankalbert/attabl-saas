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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
  );
}
