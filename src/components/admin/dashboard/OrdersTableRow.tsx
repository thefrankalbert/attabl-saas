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
import { CELL_CLS, PAYMENT_META, STATUS_META, TONE, type ColKey } from './orders-table.constants';

interface OrdersTableRowProps {
  order: Order;
  cols: Record<ColKey, boolean>;
  selected: boolean;
  onToggle: (id: string) => void;
  adminBase: string;
  locale: string;
  nowMs: number;
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
  const to = useTranslations('orders');

  const channelLabel = (): string | null => {
    if (!o.service_type) return null;
    const emporter = o.service_type === 'takeaway' || o.service_type === 'delivery';
    return emporter ? t('channelEmporter') : t('channelSurplace');
  };

  const meta = STATUS_META[o.status] ?? STATUS_META.pending;
  const StatusIcon = meta.icon;
  const channel = channelLabel();
  const created = new Date(o.created_at);
  const ageMin = Math.max(0, Math.floor((nowMs - created.getTime()) / 60000));
  const rel =
    ageMin < 60 ? t('agoMin', { n: ageMin }) : t('agoHour', { n: Math.floor(ageMin / 60) });
  const activeStatus = o.status !== 'delivered' && o.status !== 'cancelled';
  const tone =
    activeStatus && ageMin >= 30
      ? TONE.urgent
      : activeStatus && ageMin >= 15
        ? TONE.warn
        : TONE.muted;
  const pay = o.payment_status ? PAYMENT_META[o.payment_status] : null;
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
        <Link
          href={`${adminBase}/orders/${o.id}`}
          className="font-mono text-[13px] font-medium text-[var(--foreground)] hover:underline"
        >
          {o.order_number || o.id.slice(0, 8)}
        </Link>
      </TableCell>
      <TableCell className={CELL_CLS}>
        <span className="flex flex-col items-start gap-[3px]">
          <span className="text-[13px] font-medium tabular-nums">
            {created.toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[11px]"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <Clock className="size-[11px]" />
            {rel}
          </span>
        </span>
      </TableCell>
      {cols.type && (
        <TableCell className={CELL_CLS}>
          {channel ? (
            <span className="inline-flex items-center rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              {channel}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">-</span>
          )}
        </TableCell>
      )}
      <TableCell className={CELL_CLS}>
        <span className="inline-flex items-center gap-1.5 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          <StatusIcon className={cn('size-[13px]', meta.className, meta.spin && 'animate-spin')} />
          {to(meta.labelKey)}
        </span>
      </TableCell>
      {cols.payment && (
        <TableCell className={CELL_CLS}>
          {pay ? (
            <span className="inline-flex items-center gap-[5px] rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              <CreditCard className={cn('size-[13px]', pay.color)} />
              {t(pay.labelKey)}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">-</span>
          )}
        </TableCell>
      )}
      <TableCell className={cn(CELL_CLS, 'text-right tabular-nums')}>
        {formatValue(o.total_price)}
      </TableCell>
      {cols.items && (
        <TableCell
          className={cn(CELL_CLS, 'max-w-[190px] truncate text-[var(--muted-foreground)]')}
        >
          {(o.items ?? []).map((it) => it.name).join(', ') || '-'}
        </TableCell>
      )}
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
