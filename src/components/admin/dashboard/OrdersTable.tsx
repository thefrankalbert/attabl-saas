'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Clock,
  LoaderCircle,
  CircleCheck,
  CircleX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Plus,
  MoreVertical,
  Printer,
  Download,
  Eye,
  GripVertical,
  RefreshCw,
  CreditCard,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Order, OrderStatus, PaymentStatus } from '@/types/admin.types';

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

// Override the shadcn Table defaults (uppercase 12px th / 14px td) to match the
// maquette: normal-case 13px/500 muted headers, 13px cells with 10px/12px padding.
const HEAD_CLS =
  'h-10 px-3 text-[13px] font-medium normal-case tracking-normal text-[var(--muted-foreground)]';
const CELL_CLS = 'px-3 py-2.5 text-[13px]';

// Elapsed-time pill tones (maquette u-gray / u-orange / u-red)
const TONE = {
  muted: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
  warn: { bg: 'color-mix(in oklab, var(--warning) 18%, transparent)', fg: 'var(--warning)' },
  urgent: {
    bg: 'color-mix(in oklab, var(--destructive) 18%, transparent)',
    fg: 'var(--destructive)',
  },
};

type TabKey = 'all' | 'pending' | 'kitchen' | 'served' | 'cancelled';

const TAB_FILTER: Record<TabKey, (s: OrderStatus) => boolean> = {
  all: () => true,
  pending: (s) => s === 'pending',
  kitchen: (s) => s === 'preparing' || s === 'ready',
  served: (s) => s === 'delivered',
  cancelled: (s) => s === 'cancelled',
};

const STATUS_META: Record<
  OrderStatus,
  { icon: typeof Clock; className: string; spin?: boolean; labelKey: string }
> = {
  pending: {
    icon: Clock,
    className: 'text-[var(--muted-foreground)]',
    labelKey: 'statusPendingCard',
  },
  preparing: {
    icon: LoaderCircle,
    className: 'text-[var(--warning)]',
    spin: true,
    labelKey: 'statusPreparingCard',
  },
  ready: { icon: CircleCheck, className: 'text-[var(--success)]', labelKey: 'statusReadyCard' },
  delivered: {
    icon: CircleCheck,
    className: 'text-[var(--success)]',
    labelKey: 'statusDeliveredCard',
  },
  cancelled: {
    icon: CircleX,
    className: 'text-[var(--destructive)]',
    labelKey: 'statusCancelledCard',
  },
};

const PAYMENT_META: Record<PaymentStatus, { labelKey: string; color: string }> = {
  paid: { labelKey: 'payPaid', color: 'text-[var(--success)]' },
  pending: { labelKey: 'payPending', color: 'text-[var(--warning)]' },
  partial: { labelKey: 'payPartial', color: 'text-[var(--warning)]' },
  refunded: { labelKey: 'payRefunded', color: 'text-[var(--muted-foreground)]' },
};

type ColKey = 'type' | 'payment' | 'items';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};

interface OrdersTableProps {
  orders: Order[];
  formatValue: (n: number) => string;
  locale: string;
  adminBase: string;
  /** Current time in ms - used for the urgency indicator on pending orders */
  nowMs: number;
  /** Advance/cancel order status (bulk actions + row menu) */
  onStatusChange?: (orderId: string, newStatus: string) => Promise<void> | void;
}

export function OrdersTable({
  orders,
  formatValue,
  locale,
  adminBase,
  nowMs,
  onStatusChange,
}: OrdersTableProps) {
  const t = useTranslations('admin');
  const to = useTranslations('orders');
  const searchParams = useSearchParams();
  const range = searchParams.get('range') || 'today';

  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'id' | 'time' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [cols, setCols] = useState<Record<ColKey, boolean>>({
    type: true,
    payment: true,
    items: true,
  });

  // Orders scoped to the header period selector (?range=).
  const dateScoped = useMemo(() => {
    const startToday = new Date(nowMs);
    startToday.setHours(0, 0, 0, 0);
    const startMs = startToday.getTime();
    return orders.filter((o) => {
      const ts = new Date(o.created_at).getTime();
      if (range === 'yesterday') return ts >= startMs - 86400000 && ts < startMs;
      if (range === '7d') return ts >= nowMs - 7 * 86400000;
      if (range === '30d') return ts >= nowMs - 30 * 86400000;
      if (range === 'today') return ts >= startMs;
      return true;
    });
  }, [orders, range, nowMs]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: 0, pending: 0, kitchen: 0, served: 0, cancelled: 0 };
    for (const o of dateScoped) {
      c.all += 1;
      (Object.keys(TAB_FILTER) as TabKey[]).forEach((k) => {
        if (k !== 'all' && TAB_FILTER[k](o.status)) c[k] += 1;
      });
    }
    return c;
  }, [dateScoped]);

  const filtered = useMemo(() => {
    const list = dateScoped.filter((o) => TAB_FILTER[tab](o.status));
    if (!sortKey) return list;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'id') {
        return (a.order_number || a.id).localeCompare(b.order_number || b.id) * dir;
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });
  }, [dateScoped, tab, sortKey, sortDir]);

  const toggleSort = (key: 'id' | 'time') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const colCount = 6 + (cols.type ? 1 : 0) + (cols.payment ? 1 : 0) + (cols.items ? 1 : 0);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('tabAll') },
    { key: 'pending', label: t('tabPending') },
    { key: 'kitchen', label: t('tabKitchen') },
    { key: 'served', label: t('tabServed') },
    { key: 'cancelled', label: t('tabCancelled') },
  ];

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPageSelected = rows.length > 0 && rows.every((o) => selected.has(o.id));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) rows.forEach((o) => next.delete(o.id));
      else rows.forEach((o) => next.add(o.id));
      return next;
    });

  const changeTab = (key: TabKey) => {
    setTab(key);
    setPage(0);
  };

  const channelLabel = (o: Order): string | null => {
    if (!o.service_type) return null;
    const emporter = o.service_type === 'takeaway' || o.service_type === 'delivery';
    return emporter ? t('channelEmporter') : t('channelSurplace');
  };

  // Export the current view (selected rows, else the active tab) as CSV.
  const exportCsv = () => {
    const source = selected.size > 0 ? filtered.filter((o) => selected.has(o.id)) : filtered;
    const header = [
      t('colOrder'),
      t('colTime'),
      t('colStatus'),
      t('colPayment'),
      t('colAmount'),
      t('colItems'),
    ];
    const lines = source.map((o) => [
      o.order_number || o.id.slice(0, 8),
      new Date(o.created_at).toLocaleString(locale),
      to((STATUS_META[o.status] ?? STATUS_META.pending).labelKey),
      o.payment_status ? t(PAYMENT_META[o.payment_status].labelKey) : '-',
      String(o.total_price),
      String((o.items ?? []).reduce((s, it) => s + (it.quantity || 0), 0)),
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commandes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedOrders = () => filtered.filter((o) => selected.has(o.id));
  const bulkAdvance = () => {
    if (!onStatusChange) return;
    for (const o of selectedOrders()) {
      const next = NEXT_STATUS[o.status];
      if (next) onStatusChange(o.id, next);
    }
  };
  const bulkCancel = () => {
    if (!onStatusChange) return;
    for (const o of selectedOrders()) onStatusChange(o.id, 'cancelled');
  };

  return (
    <div className="px-3 @sm:px-5">
      {/* Toolbar: tabs + selection count */}
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex gap-0.5 rounded-[0.625rem] bg-[var(--muted)] p-[3px]">
          {TABS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              onClick={() => changeTab(key)}
              className={cn(
                'h-auto gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-[13px] font-normal hover:bg-transparent',
                tab === key
                  ? 'bg-[var(--background)] font-medium text-[var(--foreground)] shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
              )}
            >
              {label}
              <span
                className={cn(
                  'grid h-4 min-w-[18px] place-items-center rounded-full px-[5px] text-[11px]',
                  tab === key
                    ? 'bg-[var(--secondary)] text-[var(--secondary-foreground)]'
                    : 'bg-[var(--muted-foreground)] text-[var(--background)]',
                )}
              >
                {counts[key]}
              </span>
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-8 gap-1.5 px-3 text-[13px] font-normal"
              >
                <Columns3 className="size-[15px] text-[var(--muted-foreground)]" />
                {t('colColumns')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('colColumns')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={cols.type}
                onCheckedChange={(v) => setCols((c) => ({ ...c, type: !!v }))}
              >
                {t('colType')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cols.payment}
                onCheckedChange={(v) => setCols((c) => ({ ...c, payment: !!v }))}
              >
                {t('colPayment')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cols.items}
                onCheckedChange={(v) => setCols((c) => ({ ...c, items: !!v }))}
              >
                {t('colItems')}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            asChild
            type="button"
            variant="outline"
            className="h-8 gap-1.5 px-3 text-[13px] font-normal"
          >
            <Link href={`${adminBase}/pos`}>
              <Plus className="size-[15px] text-[var(--muted-foreground)]" />
              {t('colAdd')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Selection bar (maquette .sel-bar) */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-[0.625rem] border border-[var(--ring)] bg-[var(--accent)] px-3 py-[7px]">
          <span className="text-[13px] font-semibold text-[var(--foreground)]">
            {t('selectedCount', { count: selected.size })}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
              className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
            >
              <Printer className="size-[14px] text-[var(--muted-foreground)]" />
              {t('bulkPrint')}
            </Button>
            {onStatusChange && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={bulkAdvance}
                  className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
                >
                  <RefreshCw className="size-[14px] text-[var(--muted-foreground)]" />
                  {t('bulkStatus')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={bulkCancel}
                  className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal text-[var(--destructive)]"
                >
                  <CircleX className="size-[14px]" />
                  {t('bulkCancel')}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={exportCsv}
              className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
            >
              <Download className="size-[14px] text-[var(--muted-foreground)]" />
              {t('bulkExport')}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[var(--muted)] hover:bg-[var(--muted)]">
              <TableHead className={cn(HEAD_CLS, 'w-10')}>
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={togglePage}
                  aria-label="Select page"
                />
              </TableHead>
              <TableHead className={HEAD_CLS}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleSort('id')}
                  className="h-auto gap-1 p-0 text-[13px] font-medium text-[var(--muted-foreground)] hover:bg-transparent hover:text-[var(--foreground)]"
                >
                  {t('colOrder')}
                  {sortKey === 'id' &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="size-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="size-3.5 opacity-70" />
                    ))}
                </Button>
              </TableHead>
              <TableHead className={HEAD_CLS}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleSort('time')}
                  className="h-auto gap-1 p-0 text-[13px] font-medium text-[var(--muted-foreground)] hover:bg-transparent hover:text-[var(--foreground)]"
                >
                  {t('colTime')}
                  {sortKey === 'time' &&
                    (sortDir === 'asc' ? (
                      <ChevronUp className="size-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="size-3.5 opacity-70" />
                    ))}
                </Button>
              </TableHead>
              {cols.type && <TableHead className={HEAD_CLS}>{t('colType')}</TableHead>}
              <TableHead className={HEAD_CLS}>{t('colStatus')}</TableHead>
              {cols.payment && <TableHead className={HEAD_CLS}>{t('colPayment')}</TableHead>}
              <TableHead className={cn(HEAD_CLS, 'text-right')}>{t('colAmount')}</TableHead>
              {cols.items && <TableHead className={HEAD_CLS}>{t('colItems')}</TableHead>}
              <TableHead className={cn(HEAD_CLS, 'w-10')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-24 text-center text-[13px] text-[var(--muted-foreground)]"
                >
                  {t('ordersTableEmpty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((o) => {
                const meta = STATUS_META[o.status] ?? STATUS_META.pending;
                const StatusIcon = meta.icon;
                const channel = channelLabel(o);
                const created = new Date(o.created_at);
                const ageMin = Math.max(0, Math.floor((nowMs - created.getTime()) / 60000));
                const rel =
                  ageMin < 60
                    ? t('agoMin', { n: ageMin })
                    : t('agoHour', { n: Math.floor(ageMin / 60) });
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
                        checked={selected.has(o.id)}
                        onCheckedChange={() => toggleRow(o.id)}
                        aria-label="Select order"
                      />
                    </TableCell>
                    <TableCell className={CELL_CLS}>
                      <span className="flex items-center gap-2">
                        <GripVertical className="size-[14px] shrink-0 cursor-grab text-[var(--muted-foreground)]" />
                        <Link
                          href={`${adminBase}/orders`}
                          className="font-mono text-[13px] font-medium text-[var(--foreground)] hover:underline"
                        >
                          {o.order_number || o.id.slice(0, 8)}
                        </Link>
                      </span>
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
                        <StatusIcon
                          className={cn('size-[13px]', meta.className, meta.spin && 'animate-spin')}
                        />
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
                        className={cn(
                          CELL_CLS,
                          'max-w-[190px] truncate text-[var(--muted-foreground)]',
                        )}
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
                            <Link href={`${adminBase}/orders`}>
                              <Eye className="size-4" />
                              {t('rowView')}
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: selection text (left) + rows-per-page + page indicator + nav (right) */}
      <div className="mt-3 flex flex-col items-stretch gap-3 px-1 sm:flex-row sm:items-center">
        <div className="flex-1 text-[13px] text-[var(--muted-foreground)]">
          {t('selectedCount', { count: selected.size })}
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            {t('rowsPerPage')}
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-[30px] w-[72px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-[13px] font-medium">
            {t('pageOf', { page: safePage + 1, total: pageCount })}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-[30px]"
              disabled={safePage === 0}
              onClick={() => setPage(0)}
              aria-label="First page"
            >
              <ChevronsLeft className="size-[15px]" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-[30px]"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-[15px]" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-[30px]"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="size-[15px]" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-[30px]"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(pageCount - 1)}
              aria-label="Last page"
            >
              <ChevronsRight className="size-[15px]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
