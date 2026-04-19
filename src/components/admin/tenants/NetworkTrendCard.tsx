'use client';

import { TrendingUp, BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChartDataPoint, ChartMode, ChartPeriod } from '@/types/command-center.types';

function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

function formatCompactCFA(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

interface NetworkTrendCardProps {
  data: ChartDataPoint[];
  period: ChartPeriod;
  mode: ChartMode;
  onPeriodChange: (period: ChartPeriod) => void;
  onModeChange: (mode: ChartMode) => void;
}

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
};

const MODE_LABELS: Record<ChartMode, string> = {
  revenue: 'CA',
  orders: 'Commandes',
};

export function NetworkTrendCard({
  data,
  period,
  mode,
  onPeriodChange,
  onModeChange,
}: NetworkTrendCardProps) {
  const ChartIcon = mode === 'revenue' ? TrendingUp : BarChart3;

  return (
    <section className="flex shrink-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-1 py-2">
        <div className="flex items-center gap-2">
          <ChartIcon className="h-3.5 w-3.5 text-app-text-muted" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
            Performance reseau
          </h2>
          <span className="hidden text-[11px] text-app-text-muted sm:inline">
            {mode === 'revenue' ? "Chiffre d'affaires" : 'Commandes'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-app-elevated p-0.5">
            {(['revenue', 'orders'] as const).map((m) => (
              <Button
                key={m}
                variant="ghost"
                onClick={() => onModeChange(m)}
                className={cn(
                  'h-auto rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                  mode === m
                    ? 'bg-app-card text-accent shadow-sm'
                    : 'text-app-text-muted hover:text-app-text-secondary',
                )}
              >
                {MODE_LABELS[m]}
              </Button>
            ))}
          </div>
          <div className="flex items-center rounded-lg bg-app-elevated p-0.5">
            {(['day', 'week', 'month'] as const).map((p) => (
              <Button
                key={p}
                variant="ghost"
                onClick={() => onPeriodChange(p)}
                className={cn(
                  'h-auto rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                  period === p
                    ? 'bg-app-card text-app-text shadow-sm'
                    : 'text-app-text-muted hover:text-app-text-secondary',
                )}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[160px] pt-2 sm:h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'revenue' ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="networkRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                  <stop offset="60%" stopColor="var(--accent)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                dy={4}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                tickFormatter={formatCompactCFA}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-elevated)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: 'var(--app-text)',
                  padding: '6px 10px',
                }}
                formatter={(value: number | undefined) => [formatCFA(value ?? 0), 'CA']}
                labelStyle={{
                  color: 'var(--app-text-muted)',
                  fontSize: '10px',
                  marginBottom: '2px',
                }}
                cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--accent)"
                fill="url(#networkRevenueGrad)"
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: 'var(--accent)',
                  stroke: 'var(--app-card)',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                dy={4}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--app-text-muted)', fontWeight: 500 }}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-elevated)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: 'var(--app-text)',
                  padding: '6px 10px',
                }}
                formatter={(value: number | undefined) => [value ?? 0, 'Commandes']}
                labelStyle={{
                  color: 'var(--app-text-muted)',
                  fontSize: '10px',
                  marginBottom: '2px',
                }}
                cursor={{ fill: 'var(--accent)', fillOpacity: 0.06 }}
              />
              <Bar dataKey="orders" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
