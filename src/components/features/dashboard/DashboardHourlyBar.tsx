'use client';

import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { HourlyOrderCount } from '@/types/admin.types';

interface DashboardHourlyBarProps {
  data: HourlyOrderCount[];
  t: (key: string) => string;
}

export default function DashboardHourlyBar({ data, t }: DashboardHourlyBarProps) {
  return (
    <div className="bg-surface-primary border border-border-default rounded-xl shadow-none transition-colors hover:border-border-strong flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border-default">
        <h2 className="text-sm font-semibold text-text-primary">{t('hourlyOrders')}</h2>
      </div>

      <div className="flex-1 min-h-0 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              dy={4}
              interval={1}
            />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#fff',
                padding: '8px 12px',
              }}
              formatter={(value: number | undefined) => [value ?? 0, t('ordersPerHour')]}
              labelStyle={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}
              cursor={{ fill: 'rgba(204, 255, 0, 0.08)' }}
            />
            <Bar dataKey="count" fill="#CCFF00" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
