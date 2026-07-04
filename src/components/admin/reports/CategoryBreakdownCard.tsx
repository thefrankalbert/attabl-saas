'use client';

import { useTranslations } from 'next-intl';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_PALETTE } from '@/lib/design-tokens';
import type { CategoryBreakdown, CurrencyFormatter } from './reports.types';

interface CategoryBreakdownCardProps {
  categories: CategoryBreakdown[];
  fmt: CurrencyFormatter;
}

export function CategoryBreakdownCard({ categories, fmt }: CategoryBreakdownCardProps) {
  const t = useTranslations('reports');

  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
      <h3 className="text-sm font-bold text-app-text mb-4">{t('categoryBreakdown')}</h3>
      {categories.length === 0 ? (
        <p className="text-sm text-app-text-muted text-center py-6">{t('noCategories')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={categories.map((cat) => ({
                name: cat.category,
                value: cat.revenue,
                percentage: cat.percentage,
              }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {categories.map((_cat, idx) => (
                <Cell key={`cell-${idx}`} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--app-elevated)',
                border: '1px solid var(--app-border)',
                borderRadius: '8px',
                color: 'var(--app-text)',
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                return [
                  fmt(Number.isFinite(numericValue) ? numericValue : 0),
                  typeof name === 'string' ? name : '',
                ];
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={6}
              formatter={(value: string) => (
                <span className="text-[11px] text-app-text-secondary">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
