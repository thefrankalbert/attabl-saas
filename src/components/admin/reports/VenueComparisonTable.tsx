'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import { CHART_NEUTRAL, CHART_PALETTE } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import { venueKey, type VenueRow, type VenueTopItem } from '@/hooks/queries/useVenueReport';
import type { CurrencyFormatter } from './reports.types';

interface Line extends VenueRow {
  key: string;
  label: string;
  share: number;
  color: string;
  bestSeller: string | null;
}

interface VenueComparisonTableProps {
  rows: VenueRow[];
  topItems: VenueTopItem[];
  /** Espace choisi dans le filtre (mis en avant), null = tous. */
  selectedKey: string | null;
  fmt: CurrencyFormatter;
  labelOf: (row: Pick<VenueRow, 'venueId' | 'venueName'>) => string;
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-app-elevated">
        {/* Couleur dynamique de la palette des graphiques: style inline voulu. */}
        <div
          className="h-full rounded-full"
          style={{ width: `${share}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right tabular-nums">{share}%</span>
    </div>
  );
}

/** Tableau qui compare les espaces d'UN restaurant (cartes sur mobile). */
export function VenueComparisonTable({
  rows,
  topItems,
  selectedKey,
  fmt,
  labelOf,
}: VenueComparisonTableProps) {
  const tv = useTranslations('reports.venueReport');

  const lines = useMemo<Line[]>(() => {
    const total = rows.reduce((s, r) => s + r.revenue, 0);
    let paletteIndex = 0;
    return rows.map((r) => {
      const key = venueKey(r);
      // Ligne "sans espace": gris neutre, ce n'est pas un vrai espace.
      const color = r.venueId
        ? CHART_PALETTE[paletteIndex++ % CHART_PALETTE.length]
        : CHART_NEUTRAL;
      const best = topItems.find((i) => venueKey(i) === key);
      return {
        ...r,
        key,
        label: labelOf(r),
        share: total > 0 ? Math.round((r.revenue / total) * 100) : 0,
        color,
        bestSeller: best?.name ?? null,
      };
    });
  }, [rows, topItems, labelOf]);

  const columns = useMemo<ColumnDef<Line, unknown>[]>(
    () => [
      {
        id: 'venue',
        header: tv('colVenue'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.original.color }}
            />
            <span className={cn('font-medium', row.original.key === selectedKey && 'font-bold')}>
              {row.original.label}
            </span>
          </div>
        ),
      },
      {
        id: 'revenue',
        header: () => <div className="text-right">{tv('colRevenue')}</div>,
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums whitespace-nowrap">
            {fmt(row.original.revenue)}
          </div>
        ),
      },
      {
        id: 'share',
        header: () => <div className="text-right">{tv('colShare')}</div>,
        cell: ({ row }) => <ShareBar share={row.original.share} color={row.original.color} />,
      },
      {
        id: 'orders',
        header: () => <div className="text-right">{tv('colOrders')}</div>,
        cell: ({ row }) => <div className="text-right tabular-nums">{row.original.orders}</div>,
      },
      {
        id: 'avgBasket',
        header: () => <div className="text-right">{tv('colAvgTicket')}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums whitespace-nowrap">
            {fmt(row.original.avgBasket)}
          </div>
        ),
      },
      {
        id: 'bestSeller',
        header: tv('colBestSeller'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.bestSeller ?? '-'}</span>
        ),
      },
    ],
    [tv, fmt, selectedKey],
  );

  const hasUnassigned = lines.some((l) => l.venueId === null);

  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-app-text">{tv('comparisonTitle')}</h3>
      <ResponsiveDataTable
        columns={columns}
        data={lines}
        emptyMessage={tv('noSales')}
        mobileConfig={{
          renderCard: (l) => (
            <div
              className={cn(
                'rounded-xl border border-app-border/60 p-3 space-y-2',
                l.key === selectedKey && 'ring-1 ring-app-text/30',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="truncate font-semibold text-app-text">{l.label}</span>
                </div>
                <span className="font-bold tabular-nums text-app-text">{fmt(l.revenue)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-app-text-secondary">
                <span>{tv('colShare')}</span>
                <ShareBar share={l.share} color={l.color} />
                <span>{tv('colOrders')}</span>
                <span className="text-right tabular-nums">{l.orders}</span>
                <span>{tv('colAvgTicket')}</span>
                <span className="text-right tabular-nums">{fmt(l.avgBasket)}</span>
                <span>{tv('colBestSeller')}</span>
                <span className="truncate text-right">{l.bestSeller ?? '-'}</span>
              </div>
            </div>
          ),
        }}
      />
      {hasUnassigned && <p className="text-xs text-app-text-muted">{tv('unassignedHint')}</p>}
    </div>
  );
}
