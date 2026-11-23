'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { PeriodPills } from '@/components/admin/reports/PeriodPills';
import { Button } from '@/components/ui/button';
import { useAdvancedReports } from '@/hooks/queries/useAdvancedReports';
import { useSessionState } from '@/hooks/useSessionState';
import { formatCurrencyMinor } from '@/lib/utils/money';
import type { CurrencyCode } from '@/types/admin.types';
import type { Period } from '@/components/admin/reports/reports.types';
import { PeriodComparisonCard } from './PeriodComparisonCard';
import { SalesHeatmapCard } from './SalesHeatmapCard';
import { PaymentMethodsCard } from './PaymentMethodsCard';
import { DishMarginsCard } from './DishMarginsCard';
import { StockLossesCard } from './StockLossesCard';

interface AdvancedReportsClientProps {
  tenantId: string;
  currency?: CurrencyCode;
  /** Fuseau du restaurant (resolveTenantTimezone), resolu par la page. */
  timezone: string;
}

/** Rapports avances (Business et plus): cinq rapports sur un seul restaurant. */
export default function AdvancedReportsClient({
  tenantId,
  currency = 'XAF',
  timezone,
}: AdvancedReportsClientProps) {
  const t = useTranslations('reports');
  const ta = useTranslations('reports.advanced');
  const fmt = useCallback((amount: number) => formatCurrencyMinor(amount, currency), [currency]);
  const [period, setPeriod] = useSessionState<Period>('reports:period', '7d');
  // Meme garde d'hydratation que ReportsClient (periode lue dans sessionStorage).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading, error, refetch } = useAdvancedReports(tenantId, period, timezone);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4">
        <AdminPageHeader
          title={ta('title')}
          actions={<PeriodPills period={period} setPeriod={setPeriod} />}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
        <div className="space-y-4">
          {/* La comparaison a ses propres periodes (semaine, mois): independante des pastilles. */}
          <PeriodComparisonCard tenantId={tenantId} timezone={timezone} fmt={fmt} />

          {error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="w-10 h-10 text-app-text-muted mb-3" />
              <p className="text-sm text-status-error">{t('loadError')}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                {t('retry')}
              </Button>
            </div>
          ) : isLoading || !mounted || !data ? (
            <div className="space-y-4" aria-busy="true">
              <div className="h-72 animate-pulse rounded-xl bg-app-elevated" />
              <div className="h-72 animate-pulse rounded-xl bg-app-elevated" />
            </div>
          ) : (
            <>
              <SalesHeatmapCard cells={data.heatmap} fmt={fmt} />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <PaymentMethodsCard rows={data.methods} fmt={fmt} />
                </div>
                <div className="lg:col-span-2">
                  <StockLossesCard rows={data.losses} currency={currency} fmt={fmt} />
                </div>
              </div>
              <DishMarginsCard rows={data.margins} currency={currency} fmt={fmt} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
