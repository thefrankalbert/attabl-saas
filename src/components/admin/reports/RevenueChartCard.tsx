'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { CHART_PALETTE } from '@/lib/design-tokens';
import { fromMinorUnits } from '@/lib/utils/money';
import type { CurrencyCode } from '@/types/admin.types';
import type { CurrencyFormatter, DailyStats } from './reports.types';

interface RevenueChartCardProps {
  dailyStats: DailyStats[];
  periodDisplayLabel: string;
  fmt: CurrencyFormatter;
  currency: CurrencyCode;
}

export function RevenueChartCard({
  dailyStats,
  periodDisplayLabel,
  fmt,
  currency,
}: RevenueChartCardProps) {
  const t = useTranslations('reports');
  const locale = useLocale();
  // Axe en notation compacte (1,2 Md, 350 M): un montant complet a 10 chiffres
  // ne tient pas dans la largeur de l'axe. Le montant exact reste dans l'infobulle.
  const compact = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    [locale],
  );

  return (
    <div className="lg:col-span-2 bg-app-card border border-app-border/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-app-text-muted" />
          <h3 className="text-sm font-bold text-app-text">{t('revenueEvolution')}</h3>
        </div>
        <span className="text-[10px] font-medium text-app-text-muted bg-app-elevated px-2 py-0.5 rounded-md">
          {periodDisplayLabel}
        </span>
      </div>
      {dailyStats.length === 0 ? (
        <div className="h-52 flex items-center justify-center">
          <p className="text-sm text-app-text-muted">{t('noData')}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={dailyStats.map((d) => ({
              ...d,
              // Jour du calendrier du restaurant (AAAA-MM-JJ), lu comme date locale:
              // new Date() le lirait comme minuit UTC et decalerait la barre a l'ouest.
              label: format(parseISO(d.date), 'dd/MM'),
            }))}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
              axisLine={{ stroke: 'var(--app-border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => compact.format(fromMinorUnits(v, currency))}
              width={65}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--app-elevated)',
                border: '1px solid var(--app-border)',
                borderRadius: '8px',
                color: 'var(--app-text)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--app-text-muted)', fontSize: 11 }}
              formatter={(value, _name, item) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                const payload = item as { payload?: DailyStats };
                return [
                  `${fmt(Number.isFinite(numericValue) ? numericValue : 0)} - ${t('ordersCountShort', { count: payload.payload?.orders ?? 0 })}`,
                  t('revenueLabel'),
                ];
              }}
              cursor={{ fill: 'var(--app-accent-muted)' }}
            />
            <Bar dataKey="revenue" fill={CHART_PALETTE[3]} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
