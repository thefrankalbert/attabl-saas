'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHART_PALETTE } from '@/lib/design-tokens';
import type { HeatCell } from '@/hooks/queries/useAdvancedReports';
import type { CurrencyFormatter } from '../reports.types';

interface SalesHeatmapCardProps {
  cells: HeatCell[];
  fmt: CurrencyFormatter;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HEAT_COLOR = CHART_PALETTE[3];

/** Heures fortes: chiffre d'affaires par jour et par heure, a l'heure du restaurant. */
export function SalesHeatmapCard({ cells, fmt }: SalesHeatmapCardProps) {
  const t = useTranslations('reports.advanced');

  const { byKey, max, top } = useMemo(() => {
    const map = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c]));
    const peak = cells.reduce((m, c) => Math.max(m, c.revenue), 0);
    const best = cells
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
    return { byKey: map, max: peak, top: best };
  }, [cells]);

  const dayLabel = (d: number) => t(`day${d}`);

  return (
    <section className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-app-text">{t('heatmapTitle')}</h3>

      {cells.length === 0 ? (
        <p className="text-sm text-app-text-muted">{t('noSales')}</p>
      ) : (
        <>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {top.map((c, i) => (
              <li key={`${c.day}-${c.hour}`} className="rounded-lg bg-app-elevated px-3 py-2">
                <p className="text-xs text-app-text-muted">{t('peakRank', { rank: i + 1 })}</p>
                <p className="text-sm font-semibold text-app-text">
                  {t('slot', { day: dayLabel(c.day), hour: c.hour })}
                </p>
                <p className="text-xs tabular-nums text-app-text-secondary">
                  {fmt(c.revenue)} - {t('ordersCount', { count: c.orders })}
                </p>
              </li>
            ))}
          </ol>

          {/* Grille 7 x 24. Le conteneur de Table defile a l'horizontale sur petit ecran. */}
          <Table className="min-w-[640px] table-fixed border-separate border-spacing-0.5 text-[10px]">
            <TableHeader className="bg-transparent [&_tr]:border-0">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="h-auto w-10 p-0" />
                {HOURS.map((h) => (
                  <TableHead
                    key={h}
                    className="h-auto p-0 text-center text-[10px] font-normal text-app-text-muted"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {DAYS.map((d) => (
                <TableRow key={d} className="border-0 hover:bg-transparent">
                  <TableHead
                    scope="row"
                    className="h-auto p-0 pr-1 text-left text-[10px] font-medium text-app-text-secondary"
                  >
                    {t(`dayShort${d}`)}
                  </TableHead>
                  {HOURS.map((h) => {
                    const c = byKey.get(`${d}-${h}`);
                    const ratio = c && max > 0 ? Math.max(c.revenue, 0) / max : 0;
                    const label = c
                      ? `${t('slot', { day: dayLabel(d), hour: h })}: ${fmt(c.revenue)}, ${t('ordersCount', { count: c.orders })}`
                      : undefined;
                    return (
                      <TableCell
                        key={h}
                        title={label}
                        className="h-6 rounded-sm bg-app-elevated p-0"
                        // Intensite proportionnelle au chiffre: valeur dynamique, style inline voulu.
                        style={
                          ratio > 0
                            ? { backgroundColor: HEAT_COLOR, opacity: 0.15 + 0.85 * ratio }
                            : undefined
                        }
                      >
                        {/* La couleur ne suffit pas: le montant est lu par les lecteurs d'ecran. */}
                        {label && <span className="sr-only">{label}</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-app-text-muted">{t('heatmapHint')}</p>
        </>
      )}
    </section>
  );
}
