'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, MoreVertical, Eye, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Order } from '@/types/admin.types';
import { CELL_CLS, PAYMENT_COL_CLS, type ColKey } from './orders-table.constants';
import { useOrderRowView } from './use-order-row-view';

interface OrdersTableRowProps {
  order: Order;
  cols: Record<ColKey, boolean>;
  selected: boolean;
  onToggle: (id: string) => void;
  adminBase: string;
  locale: string;
  /** null until hydrated: time-of-day and age are browser-only (clock + timezone). */
  nowMs: number | null;
  formatValue: (n: number) => string;
}

export function OrdersTableRow({
  order: o,
  cols,
  selected,
  onToggle,
  adminBase,
  locale,
  nowMs,
  formatValue,
}: OrdersTableRowProps) {
  const t = useTranslations('admin');
  const v = useOrderRowView(o, locale, nowMs);
  const StatusIcon = v.meta.icon;
  return (
    <TableRow key={o.id}>
      <TableCell className={CELL_CLS}>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(o.id)}
          aria-label="Select order"
        />
      </TableCell>
      <TableCell className={CELL_CLS}>
        <span className="flex flex-col items-start gap-[3px]">
          {/* Long numbers (CMD-20260403-001) shortened for display: #001 */}
          <Link
            href={`${adminBase}/orders/${o.id}`}
            title={o.order_number || undefined}
            className="font-mono text-[13px] font-medium text-[var(--foreground)] hover:underline"
          >
            {v.shortNumber}
          </Link>
          {cols.items && (
            <span className="max-w-[130px] truncate text-xs text-[var(--muted-foreground)]">
              {v.itemNames}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className={CELL_CLS}>
        <span className="flex flex-col items-start gap-[3px]">
          <span className="text-[13px] font-medium tabular-nums">{v.timeLabel}</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[11px]"
            style={{ background: v.tone.bg, color: v.tone.fg }}
          >
            <Clock className="size-[11px]" />
            {v.rel}
          </span>
        </span>
      </TableCell>
      {cols.type && (
        <TableCell className={CELL_CLS}>
          {v.channel ? (
            <span className="inline-flex items-center rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              {v.channel}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">-</span>
          )}
        </TableCell>
      )}
      <TableCell className={CELL_CLS}>
        <span className="inline-flex items-center gap-1.5 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          <StatusIcon
            className={cn('size-[13px]', v.meta.className, v.meta.spin && 'animate-spin')}
          />
          {v.statusLabel}
        </span>
      </TableCell>
      {cols.payment && (
        <TableCell className={cn(CELL_CLS, PAYMENT_COL_CLS)}>
          {v.pay ? (
            <span className="inline-flex items-center gap-[5px] rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              <CreditCard className={cn('size-[13px]', v.pay.color)} />
              {v.payLabel}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">-</span>
          )}
        </TableCell>
      )}
      <TableCell className={cn(CELL_CLS, 'text-right tabular-nums')}>
        {formatValue(o.total_price)}
      </TableCell>
      <TableCell className={cn(CELL_CLS, 'w-10')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('rowMenuLabel')}
            >
              <MoreVertical className="size-[15px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`${adminBase}/orders/${o.id}`}>
                <Eye className="size-4" />
                {t('rowView')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
