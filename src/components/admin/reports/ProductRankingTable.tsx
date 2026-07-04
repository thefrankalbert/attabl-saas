'use client';

import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CurrencyFormatter, TopItem } from './reports.types';

interface ProductRankingTableProps {
  topItems: TopItem[];
  fmt: CurrencyFormatter;
}

export function ProductRankingTable({ topItems, fmt }: ProductRankingTableProps) {
  const t = useTranslations('reports');

  return (
    <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
      <h3 className="text-sm font-bold text-app-text mb-3">{t('productRanking')}</h3>
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="border-b border-app-border/60">
            <TableHead className="text-left py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
              #
            </TableHead>
            <TableHead className="text-left py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
              {t('productName')}
            </TableHead>
            <TableHead className="text-right py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
              {t('ordersCount')}
            </TableHead>
            <TableHead className="text-right py-2.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
              {t('revenueLabel')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topItems.map((item, index) => (
            <TableRow
              key={item.id}
              className="border-b border-app-border/30 hover:bg-app-elevated/50 transition-colors"
            >
              <TableCell className="py-2.5 px-2 tabular-nums text-app-text-muted font-bold text-xs">
                {index + 1}
              </TableCell>
              <TableCell className="py-2.5 px-2 font-medium text-app-text text-sm">
                {item.name}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-app-text-secondary text-sm">
                {item.quantity}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-app-text font-semibold text-sm">
                {fmt(item.revenue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
