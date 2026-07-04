'use client';

import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CurrencyFormatter, ServerStats } from './reports.types';

interface ServerPerformanceCardProps {
  serverStats: ServerStats[];
  fmt: CurrencyFormatter;
}

export function ServerPerformanceCard({ serverStats, fmt }: ServerPerformanceCardProps) {
  const t = useTranslations('reports');

  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-app-text-muted" />
        <h3 className="text-sm font-bold text-app-text">{t('serverPerformance')}</h3>
      </div>
      {serverStats.length === 0 ? (
        <p className="text-sm text-app-text-muted text-center py-6">{t('noServerData')}</p>
      ) : (
        <div className="space-y-4">
          <ResponsiveContainer width="100%" height={Math.max(serverStats.length * 40, 100)}>
            <BarChart
              data={serverStats}
              layout="vertical"
              margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: 'var(--app-text-muted)' }}
                axisLine={{ stroke: 'var(--app-border)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="serverName"
                tick={{ fontSize: 11, fill: 'var(--app-text-secondary)' }}
                axisLine={false}
                tickLine={false}
                width={100}
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
                formatter={(value) => {
                  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                  return [`${Number.isFinite(numericValue) ? numericValue : 0}`, t('ordersCount')];
                }}
              />
              <Bar dataKey="orders" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>

          {/* Compact server table */}
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-b border-app-border/60">
                <TableHead className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                  {t('serverName')}
                </TableHead>
                <TableHead className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                  {t('ordersCount')}
                </TableHead>
                <TableHead className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                  {t('revenueLabel')}
                </TableHead>
                <TableHead className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
                  {t('avgOrderValue')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serverStats.map((s) => (
                <TableRow
                  key={s.serverName}
                  className="border-b border-app-border/30 hover:bg-app-elevated/50 transition-colors"
                >
                  <TableCell className="py-2 px-2 font-medium text-app-text text-sm">
                    {s.serverName}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-app-text-secondary">
                    {s.orders}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-app-text font-semibold">
                    {fmt(s.revenue)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-app-text-secondary">
                    {fmt(s.avgOrder)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
