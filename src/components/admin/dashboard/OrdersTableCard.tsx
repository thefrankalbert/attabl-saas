'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, CreditCard, Eye, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Order } from '@/types/admin.types';
import type { ColKey } from './orders-table.constants';
import { useOrderRowView } from './use-order-row-view';

const BADGE_CLS =
  'inline-flex items-center gap-1.5 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]';

interface OrdersTableCardProps {
  order: Order;
  cols: Record<ColKey, boolean>;
  selected: boolean;
  onToggle: (id: string) => void;
  adminBase: string;
  locale: string;
  nowMs: number | null;
  formatValue: (n: number) => string;
}

/**
 * Phone layout of one dashboard order (below md). Same content as the desktop
 * row, stacked so nothing scrolls sideways: number and amount on top, dishes,
 * then time, status, payment and channel as wrapping badges.
 */
export function OrdersTableCard({
  order: o,
  cols,
  selected,
  onToggle,
  adminBase,
  locale,
  nowMs,
  formatValue,
}: OrdersTableCardProps) {
  const t = useTranslations('admin');
  const v = useOrderRowView(o, locale, nowMs);
  const StatusIcon = v.meta.icon;

  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(o.id)}
        aria-label="Select order"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`${adminBase}/orders/${o.id}`}
            title={o.order_number || undefined}
            className="font-mono text-[13px] font-medium text-[var(--foreground)] hover:underline"
          >
            {v.shortNumber}
          </Link>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--foreground)]">
            {formatValue(o.total_price)}
          </span>
        </div>
        {cols.items && (
          <p className="truncate text-xs text-[var(--muted-foreground)]">{v.itemNames}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium tabular-nums text-[var(--foreground)]">
            {v.timeLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[11px]"
            style={{ background: v.tone.bg, color: v.tone.fg }}
          >
            <Clock className="size-[11px]" />
            {v.rel}
          </span>
          <span className={BADGE_CLS}>
            <StatusIcon
              className={cn('size-[13px]', v.meta.className, v.meta.spin && 'animate-spin')}
            />
            {v.statusLabel}
          </span>
          {cols.payment && v.pay && (
            <span className={BADGE_CLS}>
              <CreditCard className={cn('size-[13px]', v.pay.color)} />
              {v.payLabel}
            </span>
          )}
          {cols.type && v.channel && <span className={BADGE_CLS}>{v.channel}</span>}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-my-1.5 -mr-1.5 size-11 shrink-0"
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
    </li>
  );
}
