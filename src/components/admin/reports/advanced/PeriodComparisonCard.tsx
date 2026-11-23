'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { computeDelta } from '@/lib/reports/advanced-report-math';
import {
  usePeriodComparison,
  type ComparisonMode,
  type ComparisonRow,
} from '@/hooks/queries/useAdvancedReports';
import type { CurrencyFormatter } from '../reports.types';

interface PeriodComparisonCardProps {
  tenantId: string;
  timezone: string;
  fmt: CurrencyFormatter;
}

const METRICS = [
  { key: 'revenue', labelKey: 'metricRevenue', money: true },
  { key: 'orders', labelKey: 'metricOrders', money: false },
  { key: 'avgBasket', labelKey: 'metricAvgBasket', money: true },
  { key: 'tips', labelKey: 'metricTips', money: true },
] as const satisfies readonly { key: keyof ComparisonRow; labelKey: string; money: boolean }[];

const toneOf = (diff: number) =>
  diff > 0 ? 'text-status-success' : diff < 0 ? 'text-status-error' : 'text-app-text-muted';

/** Semaine contre semaine, mois contre mois: ecart en valeur et en pourcentage. */
export function PeriodComparisonCard({ tenantId, timezone, fmt }: PeriodComparisonCardProps) {
  const t = useTranslations('reports.advanced');
  const [mode, setMode] = useState<ComparisonMode>('week');
  const { data, isLoading, error } = usePeriodComparison(tenantId, mode, timezone);
  const current = data?.find((r) => r.period === 'current');
  const previous = data?.find((r) => r.period === 'previous');

  return (
    <section className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-app-text">{t('comparisonTitle')}</h3>
        <div className="flex gap-1.5">
          {(['week', 'month'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-8 text-xs font-semibold',
                mode === m && 'bg-app-text text-app-bg border-app-text',
              )}
            >
              {t(m === 'week' ? 'modeWeek' : 'modeMonth')}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-status-error">{t('loadError')}</p>
      ) : isLoading || !current || !previous ? (
        <div className="h-40 animate-pulse rounded-lg bg-app-elevated" />
      ) : (
        <>
          {/* Moins de 640 px: une ligne par indicateur, sans tableau a 5 colonnes. */}
          <ul className="space-y-3 sm:hidden">
            {METRICS.map(({ key, labelKey, money }) => {
              const { diff, pct } = computeDelta(current[key], previous[key]);
              const show = (v: number) => (money ? fmt(v) : String(v));
              return (
                <li key={key} className="rounded-lg bg-app-elevated px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-app-text">{t(labelKey)}</span>
                    <span className="font-semibold tabular-nums text-app-text">
                      {show(current[key])}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs tabular-nums text-app-text-secondary">
                    {t(mode === 'week' ? 'lastWeek' : 'lastMonth')} : {show(previous[key])}{' '}
                    <span className={toneOf(diff)}>
                      ({diff > 0 ? '+' : ''}
                      {show(diff)}
                      {pct === null ? '' : `, ${pct > 0 ? '+' : ''}${pct}%`})
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('colMetric')}</TableHead>
                  <TableHead className="text-xs text-right">
                    {t(mode === 'week' ? 'thisWeek' : 'thisMonth')}
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    {t(mode === 'week' ? 'lastWeek' : 'lastMonth')}
                  </TableHead>
                  <TableHead className="text-xs text-right">{t('colDiff')}</TableHead>
                  <TableHead className="text-xs text-right">{t('colDiffPct')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRICS.map(({ key, labelKey, money }) => {
                  const cur = current[key];
                  const prev = previous[key];
                  const { diff, pct } = computeDelta(cur, prev);
                  const show = (v: number) => (money ? fmt(v) : String(v));
                  const tone =
                    diff > 0
                      ? 'text-status-success'
                      : diff < 0
                        ? 'text-status-error'
                        : 'text-app-text-muted';
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{t(labelKey)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {show(cur)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-app-text-secondary">
                        {show(prev)}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums whitespace-nowrap', tone)}>
                        {diff > 0 ? '+' : ''}
                        {show(diff)}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums whitespace-nowrap', tone)}>
                        {pct === null ? '-' : `${pct > 0 ? '+' : ''}${pct}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <p className="text-xs text-app-text-muted">
        {t(mode === 'week' ? 'comparisonHintWeek' : 'comparisonHintMonth')}
      </p>
    </section>
  );
}
