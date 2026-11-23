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
import { PeriodPills } from './PeriodPills';
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
      // Pourboires: une ligne a part. Ce n'est PAS une part du chiffre au-dessus:
      // le chiffre d'affaires suit la date de chaque versement au registre, les
      // pourboires la date ou la commande est soldee (paid_at). Le libelle le dit.
      note: t('tipsLine', { amount: fmt(summary.tips) }),
    },
    {
      key: 'orders',
      Icon: ShoppingBag,
      accent: false,
      label: t('orders'),
      value: summary.orders as string | number,
      trend: ordersTrend,
      note: null,
    },
    {
      key: 'basket',
      Icon: CreditCard,
      accent: false,
      label: t('averageBasket'),
      value: fmt(summary.avgBasket) as string | number,
      trend: basketTrend,
      note: null,
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

      <PeriodPills period={period} setPeriod={setPeriod} />

      {/* -- KPI Cards -- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {kpis.map(({ key, Icon, accent, label, value, trend, note }) => (
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
              <div className="flex flex-wrap items-end gap-x-2 mt-0.5">
                <p className="text-xl font-bold text-app-text tabular-nums leading-tight whitespace-nowrap">
                  {value}
                </p>
                <TrendBadge value={trend} />
              </div>
              {note && <p className="mt-0.5 text-xs text-app-text-muted tabular-nums">{note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
