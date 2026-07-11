'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { csvCell } from '@/lib/utils/csv';
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
import type { Order } from '@/types/admin.types';
import {
  HEAD_CLS,
  NEXT_STATUS,
  PAGE_SIZE,
  PAYMENT_META,
  STATUS_META,
  TAB_FILTER,
  type ColKey,
  type TabKey,
} from './orders-table.constants';
import { OrdersTableToolbar } from './OrdersTableToolbar';
import { OrdersTableSelectionBar } from './OrdersTableSelectionBar';
import { OrdersTableRow } from './OrdersTableRow';
import { OrdersTableFooter } from './OrdersTableFooter';

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
      // total_price is integer minor units - format via formatValue (minor-aware)
      // so the CSV matches the on-screen amount column.
      formatValue(o.total_price),
      String((o.items ?? []).reduce((s, it) => s + (it.quantity || 0), 0)),
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((c) => csvCell(String(c))).join(','))
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
    <div className="px-3 sm:px-5">
      {/* Toolbar: tabs + selection count */}
      <OrdersTableToolbar
        tab={tab}
        counts={counts}
        onChangeTab={changeTab}
        cols={cols}
        setCols={setCols}
        adminBase={adminBase}
      />

      {/* Selection bar (maquette .sel-bar) */}
      {selected.size > 0 && (
        <OrdersTableSelectionBar
          count={selected.size}
          canChangeStatus={!!onStatusChange}
          onBulkAdvance={bulkAdvance}
          onBulkCancel={bulkCancel}
          onExport={exportCsv}
        />
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
              rows.map((o) => (
                <OrdersTableRow
                  key={o.id}
                  order={o}
                  cols={cols}
                  selected={selected.has(o.id)}
                  onToggle={toggleRow}
                  adminBase={adminBase}
                  locale={locale}
                  nowMs={nowMs}
                  formatValue={formatValue}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: selection text (left) + rows-per-page + page indicator + nav (right) */}
      <OrdersTableFooter
        selectedCount={selected.size}
        pageSize={pageSize}
        setPageSize={setPageSize}
        setPage={setPage}
        safePage={safePage}
        pageCount={pageCount}
      />
    </div>
  );
}
