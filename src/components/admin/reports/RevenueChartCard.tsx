'use client';

import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import type { CurrencyFormatter, DailyStats } from './reports.types';

interface RevenueChartCardProps {
  dailyStats: DailyStats[];
  periodDisplayLabel: string;
  fmt: CurrencyFormatter;
}

export function RevenueChartCard({ dailyStats, periodDisplayLabel, fmt }: RevenueChartCardProps) {
  const t = useTranslations('reports');

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
              label: format(new Date(d.date), 'dd/MM'),
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
              tickFormatter={(v: number) => fmt(v)}
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
            <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
