'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import { Badge } from '@/components/ui/badge';
import { sumMinor, toMinorUnits } from '@/lib/utils/money';
import { INGREDIENT_UNITS } from '@/types/inventory.types';
import type { LossRow } from '@/hooks/queries/useAdvancedReports';
import type { CurrencyCode } from '@/types/admin.types';
import type { CurrencyFormatter } from '../reports.types';

interface StockLossesCardProps {
  rows: LossRow[];
  currency: CurrencyCode;
  fmt: CurrencyFormatter;
}

type Line = LossRow & { valueMinor: number };

const qty = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 3 });

/** Unite courte, comme l'inventaire (kg, L, pcs, bout....). */
const unitLabel = (unit: string) =>
  INGREDIENT_UNITS[unit as keyof typeof INGREDIENT_UNITS]?.labelShort || unit;

/** Libelle d'un motif de perte (cles losses.reason_*), le code brut a defaut. */
function reasonLabel(
  tl: ReturnType<typeof useTranslations<'losses'>>,
  code: string | null,
): string {
  if (!code) return '-';
  const key = `reason_${code}`;
  return tl.has(key) ? tl(key) : code;
}

/** Ingredient sans cout: sa valeur affichee (0) n'est pas une perte nulle. */
function CostMissingBadge() {
  const t = useTranslations('reports.advanced');
  return (
    <Badge variant="outline" className="whitespace-nowrap text-xs">
      {t('costMissing')}
    </Badge>
  );
}

/** Pertes et gaspillage par ingredient, en quantite et en valeur. */
export function StockLossesCard({ rows, currency, fmt }: StockLossesCardProps) {
  const t = useTranslations('reports.advanced');
  const tl = useTranslations('losses');

  // Valeurs en unites majeures (cout des ingredients) converties dans la devise.
  const lines = useMemo<Line[]>(
    () => rows.map((r) => ({ ...r, valueMinor: toMinorUnits(r.costValue, currency) })),
    [rows, currency],
  );
  const total = useMemo(
    () =>
      sumMinor(
        lines.map((l) => l.valueMinor),
        currency,
      ),
    [lines, currency],
  );

  const columns = useMemo<ColumnDef<Line, unknown>[]>(
    () => [
      { id: 'name', header: t('colIngredient'), cell: ({ row }) => row.original.name },
      {
        id: 'qty',
        header: () => <div className="text-right">{t('colQuantity')}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums whitespace-nowrap">
            {qty(row.original.quantity)} {unitLabel(row.original.unit)}
          </div>
        ),
      },
      {
        id: 'value',
        header: () => <div className="text-right">{t('colValue')}</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            {!row.original.costComplete && <CostMissingBadge />}
            <span className="font-semibold tabular-nums">{fmt(row.original.valueMinor)}</span>
          </div>
        ),
      },
      {
        id: 'count',
        header: () => <div className="text-right">{t('colMovements')}</div>,
        cell: ({ row }) => <div className="text-right tabular-nums">{row.original.movements}</div>,
      },
      {
        id: 'reason',
        header: t('colReason'),
        cell: ({ row }) => reasonLabel(tl, row.original.mainReason),
      },
    ],
    [t, tl, fmt],
  );

  return (
    <section className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-app-text">{t('lossesTitle')}</h3>
        {rows.length > 0 && (
          <p className="text-xs font-semibold tabular-nums text-app-text">
            {t('lossesTotal', { amount: fmt(total) })}
          </p>
        )}
      </div>
      <ResponsiveDataTable
        columns={columns}
        data={lines}
        emptyMessage={t('noLosses')}
        mobileConfig={{
          renderCard: (l) => (
            <div className="rounded-xl border border-app-border/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-app-text">{l.name}</span>
                <span className="flex items-center gap-2">
                  {!l.costComplete && <CostMissingBadge />}
                  <span className="font-bold tabular-nums text-app-text">{fmt(l.valueMinor)}</span>
                </span>
              </div>
              <p className="text-xs tabular-nums text-app-text-secondary">
                {qty(l.quantity)} {unitLabel(l.unit)} - {reasonLabel(tl, l.mainReason)} -{' '}
                {t('lossCount', { count: l.movements })}
              </p>
            </div>
          ),
        }}
      />
      <p className="text-xs text-app-text-muted">{t('lossesHint')}</p>
    </section>
  );
}
