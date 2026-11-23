'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import { Badge } from '@/components/ui/badge';
import {
  computeDishMargin,
  computeMarginTotals,
  type DishMarginResult,
} from '@/lib/reports/advanced-report-math';
import type { DishMargin } from '@/hooks/queries/useAdvancedReports';
import type { CurrencyCode } from '@/types/admin.types';
import type { CurrencyFormatter } from '../reports.types';

interface DishMarginsCardProps {
  rows: DishMargin[];
  currency: CurrencyCode;
  fmt: CurrencyFormatter;
}

type Line = DishMargin & DishMarginResult;

function StatusBadge({ line }: { line: Line }) {
  const t = useTranslations('reports.advanced');
  if (line.hasRecipe && line.costComplete) return null;
  return (
    <Badge variant="outline" className="whitespace-nowrap text-xs">
      {t(line.hasRecipe ? 'costIncomplete' : 'noRecipe')}
    </Badge>
  );
}

/**
 * Marge par plat: ventes moins cout matiere (fiche technique x cout des
 * ingredients). Un plat sans fiche, ou dont un ingredient n'a pas de cout,
 * est signale tel quel: aucune marge n'est inventee.
 */
export function DishMarginsCard({ rows, currency, fmt }: DishMarginsCardProps) {
  const t = useTranslations('reports.advanced');

  const lines = useMemo<Line[]>(
    () => rows.map((r) => ({ ...r, ...computeDishMargin(r, currency) })),
    [rows, currency],
  );
  const totals = useMemo(() => computeMarginTotals(rows, currency), [rows, currency]);

  const money = (v: number | null) => (v === null ? '-' : fmt(v));

  const columns = useMemo<ColumnDef<Line, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('colDish'),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <StatusBadge line={row.original} />
          </div>
        ),
      },
      {
        id: 'qty',
        header: () => <div className="text-right">{t('colSold')}</div>,
        cell: ({ row }) => <div className="text-right tabular-nums">{row.original.quantity}</div>,
      },
      {
        id: 'revenue',
        header: () => <div className="text-right">{t('colSales')}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums whitespace-nowrap">
            {fmt(row.original.revenue)}
          </div>
        ),
      },
      {
        id: 'cost',
        header: () => <div className="text-right">{t('colCost')}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums whitespace-nowrap">
            {row.original.cost === null ? '-' : fmt(row.original.cost)}
          </div>
        ),
      },
      {
        id: 'margin',
        header: () => <div className="text-right">{t('colMargin')}</div>,
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums whitespace-nowrap">
            {row.original.margin === null ? '-' : fmt(row.original.margin)}
          </div>
        ),
      },
      {
        id: 'marginPct',
        header: () => <div className="text-right">{t('colMarginPct')}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.marginPct === null ? '-' : `${row.original.marginPct}%`}
          </div>
        ),
      },
    ],
    [t, fmt],
  );

  return (
    <section className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-app-text">{t('marginsTitle')}</h3>
        {rows.length > 0 && (
          <p className="text-xs tabular-nums text-app-text-secondary">
            {t('marginsTotal', { margin: fmt(totals.margin), coverage: totals.coveragePct })}
          </p>
        )}
      </div>
      <ResponsiveDataTable
        columns={columns}
        data={lines}
        emptyMessage={t('noSales')}
        cardsBelowXl
        mobileConfig={{
          renderCard: (l) => (
            <div className="rounded-xl border border-app-border/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-app-text">{l.name}</span>
                <StatusBadge line={l} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-app-text-secondary">
                <span>{t('colSold')}</span>
                <span className="text-right tabular-nums">{l.quantity}</span>
                <span>{t('colSales')}</span>
                <span className="text-right tabular-nums">{fmt(l.revenue)}</span>
                <span>{t('colCost')}</span>
                <span className="text-right tabular-nums">{money(l.cost)}</span>
                <span>{t('colMargin')}</span>
                <span className="text-right font-semibold tabular-nums text-app-text">
                  {money(l.margin)}
                  {l.marginPct !== null && ` (${l.marginPct}%)`}
                </span>
              </div>
            </div>
          ),
        }}
      />
      <p className="text-xs text-app-text-muted">{t('marginsHint')}</p>
    </section>
  );
}
