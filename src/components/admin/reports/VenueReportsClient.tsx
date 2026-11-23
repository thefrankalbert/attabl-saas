'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, CreditCard, DollarSign, ShoppingBag } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { ReportsSkeleton } from '@/components/admin/reports/ReportsSkeleton';
import { PeriodPills } from '@/components/admin/reports/PeriodPills';
import { VenueComparisonTable } from '@/components/admin/reports/VenueComparisonTable';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVenueReport, venueKey, type VenueRow } from '@/hooks/queries/useVenueReport';
import { useSessionState } from '@/hooks/useSessionState';
import { formatCurrencyMinor } from '@/lib/utils/money';
import type { CurrencyCode } from '@/types/admin.types';
import type { Period } from '@/components/admin/reports/reports.types';

const ALL = '__all__';

interface VenueReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
}

export default function VenueReportsClient({
  tenantId,
  currency = 'XAF',
}: VenueReportsClientProps) {
  const t = useTranslations('reports');
  const tv = useTranslations('reports.venueReport');
  const fmt = useCallback((amount: number) => formatCurrencyMinor(amount, currency), [currency]);
  const [period, setPeriod] = useSessionState<Period>('reports:period', '7d');
  const [selected, setSelected] = useState<string>(ALL);
  // Meme garde d'hydratation que ReportsClient (periode lue dans sessionStorage).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading, error, refetch } = useVenueReport(tenantId, period);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const topItems = useMemo(() => data?.topItems ?? [], [data]);

  const labelOf = useCallback(
    (row: Pick<VenueRow, 'venueId' | 'venueName'>) => row.venueName ?? tv('unassigned'),
    [tv],
  );

  // Un espace choisi qui n'existe plus sur la periode retombe sur "Tous".
  const scope = rows.some((r) => venueKey(r) === selected) ? selected : ALL;
  const scopeRows = scope === ALL ? rows : rows.filter((r) => venueKey(r) === scope);
  const kpi = useMemo(() => {
    const revenue = scopeRows.reduce((s, r) => s + r.revenue, 0);
    const orders = scopeRows.reduce((s, r) => s + r.orders, 0);
    return { revenue, orders, avgBasket: orders > 0 ? Math.round(revenue / orders) : 0 };
  }, [scopeRows]);

  if (error) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="w-10 h-10 text-app-text-muted mb-3" />
        <p className="text-sm text-status-error">{t('loadError')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (isLoading || !mounted) return <ReportsSkeleton />;

  const selectedRow = scope === ALL ? null : (scopeRows[0] ?? null);
  const selectedTop = selectedRow
    ? topItems.filter((i) => venueKey(i) === venueKey(selectedRow))
    : [];

  const kpis = [
    { key: 'revenue', Icon: DollarSign, label: t('revenueLabel'), value: fmt(kpi.revenue) },
    { key: 'orders', Icon: ShoppingBag, label: t('orders'), value: String(kpi.orders) },
    { key: 'basket', Icon: CreditCard, label: tv('colAvgTicket'), value: fmt(kpi.avgBasket) },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={tv('title')}
          actions={
            <Select value={scope} onValueChange={setSelected}>
              <SelectTrigger className="h-8 w-56 max-w-full text-xs" aria-label={tv('venueFilter')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tv('allVenues')}</SelectItem>
                {rows.map((r) => (
                  <SelectItem key={venueKey(r)} value={venueKey(r)}>
                    {labelOf(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <PeriodPills period={period} setPeriod={setPeriod} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {kpis.map(({ key, Icon, label, value }) => (
            <div
              key={key}
              className="bg-app-card border border-app-border/60 rounded-xl p-4 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-app-elevated text-app-text-muted">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-app-text-muted uppercase tracking-wide">
                  {label}
                </p>
                <p className="mt-0.5 text-lg lg:text-xl font-bold text-app-text tabular-nums leading-tight truncate">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        <div className="space-y-4">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-app-text-muted">{tv('noVenues')}</p>
          ) : (
            <VenueComparisonTable
              rows={rows}
              topItems={topItems}
              selectedKey={scope === ALL ? null : scope}
              fmt={fmt}
              labelOf={labelOf}
            />
          )}

          {selectedRow && (
            <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
              <h3 className="text-sm font-bold text-app-text mb-3">
                {tv('topTitle', { venue: labelOf(selectedRow) })}
              </h3>
              {selectedTop.length === 0 ? (
                <p className="text-sm text-app-text-muted">{tv('noSales')}</p>
              ) : (
                <ol className="space-y-2">
                  {selectedTop.map((item, index) => (
                    <li key={item.itemId} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-xs font-bold tabular-nums text-app-text-muted">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-app-text">
                        {item.name}
                      </span>
                      <span className="tabular-nums text-app-text-secondary">
                        {tv('salesCount', { count: item.quantity })}
                      </span>
                      <span className="w-28 text-right font-semibold tabular-nums text-app-text">
                        {fmt(item.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
