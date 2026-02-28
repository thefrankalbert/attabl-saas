'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryBreakdown } from '@/types/admin.types';

const COLORS = ['#CCFF00', '#F59E0B', '#3B82F6', '#D4D4D8'];

interface DashboardDonutProps {
  data: CategoryBreakdown[];
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
}

export default function DashboardDonut({ data, t, fmtCompact }: DashboardDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-surface-primary border border-border-default rounded-xl shadow-none transition-colors hover:border-border-strong flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border-default">
        <h2 className="text-sm font-semibold text-text-primary">{t('categoryBreakdown')}</h2>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col items-center justify-center">
        <div className="relative w-full" style={{ maxWidth: 180, aspectRatio: '1/1' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#fff',
                  padding: '8px 12px',
                }}
                formatter={(value: number | undefined) => [fmtCompact(value ?? 0), '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-text-primary">{fmtCompact(total)}</span>
            <span className="text-[10px] text-text-secondary font-medium">{t('totalOrders')}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 w-full">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-text-secondary truncate">{item.name}</span>
              </div>
              <span className="text-text-primary font-semibold tabular-nums">
                {fmtCompact(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
