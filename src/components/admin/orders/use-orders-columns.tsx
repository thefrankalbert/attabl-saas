'use client';

import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, Eye } from 'lucide-react';
import { SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { Order } from '@/types/admin.types';
import type { OrderStatus } from '@/lib/design-tokens';
import type { GetOrderStatusConfig } from './use-order-status-config';

interface UseOrdersColumnsParams {
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  filteredOrders: Order[];
  setSelectedOrder: Dispatch<SetStateAction<Order | null>>;
  getStatusConfig: GetOrderStatusConfig;
  formatNumber: (n: number) => string;
  handleStatusChange: (orderId: string, newStatus: OrderStatus) => void;
}

/** TanStack Table column definitions for the orders table. */
export function useOrdersColumns({
  selectedIds,
  setSelectedIds,
  filteredOrders,
  setSelectedOrder,
  getStatusConfig,
  formatNumber,
  handleStatusChange,
}: UseOrdersColumnsParams): ColumnDef<Order, unknown>[] {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  return useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            aria-label={tc('selectAll')}
            checked={
              filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id))
            }
            onCheckedChange={(checked) => {
              const next = new Set(selectedIds);
              if (checked) {
                filteredOrders.forEach((o) => next.add(o.id));
              } else {
                filteredOrders.forEach((o) => next.delete(o.id));
              }
              setSelectedIds(next);
            }}
          />
        ),
        cell: ({ row }: { row: { original: Order } }) => (
          <Checkbox
            aria-label={tc('select')}
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={(checked) => {
              const next = new Set(selectedIds);
              if (checked) next.add(row.original.id);
              else next.delete(row.original.id);
              setSelectedIds(next);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'table_number',
        header: ({ column }) => <SortableHeader column={column}>{t('tableHeader')}</SortableHeader>,
        cell: ({ row }) => {
          const label = row.original.table_number?.trim() || '-';
          return (
            <div className="flex items-center gap-2">
              <span className="inline-flex min-w-[2rem] h-8 px-2 items-center justify-center font-bold text-app-text text-xs bg-app-bg rounded-lg">
                {label}
              </span>
              {row.original.preparation_zone === 'bar' && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted-foreground)]">
                  BAR
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'total_price',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {tc('total')}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const total =
            row.original.total_price ?? row.original.total ?? row.original.total_amount ?? 0;
          const tip = row.original.tip_amount ?? 0;
          return (
            <div className="text-right">
              <span className="font-mono font-bold text-app-text">{formatNumber(total + tip)}</span>
              {tip > 0 && (
                <span className="block text-xs text-[var(--success)] font-medium">
                  +{formatNumber(tip)} {ta('tipLabel')}
                </span>
              )}
            </div>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        id: 'actions',
        header: () => <span className="w-full text-right block">{tc('actions')}</span>,
        cell: ({ row }) => {
          const order = row.original;
          const config = getStatusConfig(order.status);
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedOrder(order);
                }}
                className="text-xs gap-1 min-h-[44px]"
              >
                <Eye className="w-4 h-4" />
              </Button>
              {config.nextStatus && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(order.id, config.nextStatus!);
                  }}
                  className="text-xs gap-1 min-h-[44px]"
                >
                  {config.nextLabel} <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [
      t,
      tc,
      ta,
      getStatusConfig,
      formatNumber,
      selectedIds,
      filteredOrders,
      handleStatusChange,
      setSelectedIds,
      setSelectedOrder,
    ],
  );
}
