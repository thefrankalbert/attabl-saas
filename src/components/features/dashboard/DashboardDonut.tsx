'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryBreakdown } from '@/types/admin.types';
import { CHART_COLORS } from '@/lib/design-tokens';

const COLORS = [
  'var(--accent)',
  CHART_COLORS.activeItems,
  CHART_COLORS.orders,
  'var(--app-text-muted)',
];

interface DashboardDonutProps {
  data: CategoryBreakdown[];
  t: (key: string) => string;
  fmtCompact: (amount: number) => string;
}

export default function DashboardDonut({ data, t, fmtCompact }: DashboardDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-app-card rounded-[10px] border border-app-border flex flex-col h-full hover:border-app-border-hover transition-colors">
      <div className="px-6 py-5 border-b border-app-border">
        <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">
          {t('categoryBreakdown')}
        </h2>
      </div>

      <div className="flex-1 min-h-0 p-5 flex flex-col items-center justify-center">
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
                  background: 'var(--app-card)',
                  border: '1px solid var(--app-border)',
                  borderRadius: '12px',
                  fontSize: '13px',
                  color: 'var(--app-text)',
                  padding: '10px 14px',
                }}
                formatter={(value: number | undefined) => [fmtCompact(value ?? 0), '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-black text-app-text">{fmtCompact(total)}</span>
            <span className="text-[10px] text-app-text-muted font-bold uppercase tracking-wider">
              {t('totalOrders')}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-2 w-full">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-app-text-secondary font-normal">{item.name}</span>
              </div>
              <span className="text-app-text font-bold tabular-nums">{fmtCompact(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
