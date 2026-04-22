'use client';

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface RevenueChartDataPoint {
  day: string;
  revenue: number;
}

interface DashboardChartsProps {
  revenueChartData: RevenueChartDataPoint[];
  t: (key: string) => string;
  showRevenueChart?: boolean;
}

function formatCompactValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export default function DashboardCharts({
  revenueChartData,
  t,
  showRevenueChart = true,
}: DashboardChartsProps) {
  if (!showRevenueChart) return null;

  return (
    <div className="bg-app-card rounded-[10px] border border-app-border flex flex-col h-full hover:border-app-border-hover transition-colors">
      <div className="px-6 py-5 border-b border-app-border">
        <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">
          {t('revenueThisWeek')}
        </h2>
      </div>

      <div className="flex-1 min-h-0 p-5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradientLimeEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                <stop offset="50%" stopColor="var(--accent)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--app-text-muted)', fontWeight: 500 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--app-text-muted)', fontWeight: 500 }}
              tickFormatter={formatCompactValue}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--app-card)',
                border: '1px solid var(--app-border)',
                borderRadius: '12px',
                fontSize: '13px',
                color: 'var(--app-text)',
                padding: '10px 14px',
              }}
              itemStyle={{ color: 'var(--accent)', fontWeight: 700 }}
              labelStyle={{ color: 'var(--app-text-muted)', fontSize: '11px', marginBottom: '4px' }}
              cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--accent)"
              fill="url(#revenueGradientLimeEmerald)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--app-text)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
