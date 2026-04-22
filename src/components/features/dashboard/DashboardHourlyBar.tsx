'use client';

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { HourlyOrderCount } from '@/types/admin.types';

interface DashboardHourlyBarProps {
  data: HourlyOrderCount[];
  t: (key: string) => string;
}

export default function DashboardHourlyBar({ data, t }: DashboardHourlyBarProps) {
  return (
    <div className="bg-app-card rounded-[10px] border border-app-border flex flex-col h-full hover:border-app-border-hover transition-colors">
      <div className="px-6 py-5 border-b border-app-border">
        <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">
          {t('hourlyOrders')}
        </h2>
      </div>

      <div className="flex-1 min-h-0 p-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--app-text-muted)', fontWeight: 500 }}
              dy={4}
              interval={1}
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
              formatter={(value: number | undefined) => [value ?? 0, t('ordersPerHour')]}
              labelStyle={{ color: 'var(--app-text-muted)', fontSize: '11px', marginBottom: '4px' }}
              cursor={{ fill: 'var(--app-accent)', opacity: 0.08 }}
            />
            <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
