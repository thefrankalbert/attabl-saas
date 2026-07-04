import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockMovement } from '@/types/inventory.types';
import { MOVEMENT_STYLES } from './movement-styles';

interface UseStockHistoryColumnsParams {
  locale: string;
  formatDateShort: (dateStr: string) => string;
  formatTime: (dateStr: string) => string;
}

export function useStockHistoryColumns({
  locale,
  formatDateShort,
  formatTime,
}: UseStockHistoryColumnsParams) {
  const t = useTranslations('stockHistory');

  return useMemo<ColumnDef<StockMovement, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column}>{t('columnDate')}</SortableHeader>,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-app-text tabular-nums">
              {formatDateShort(row.original.created_at)}
            </span>
            <span className="text-[10px] text-app-text-muted tabular-nums">
              {formatTime(row.original.created_at)}
            </span>
          </div>
        ),
      },
      {
        id: 'ingredient_name',
        accessorFn: (row) => row.ingredient?.name ?? '',
        header: ({ column }) => (
          <SortableHeader column={column}>{t('columnIngredient')}</SortableHeader>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium text-sm text-app-text block truncate">
              {row.original.ingredient?.name || '-'}
            </span>
            {row.original.ingredient?.unit && (
              <span className="text-[10px] text-app-text-muted uppercase tracking-wider">
                {row.original.ingredient.unit}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'movement_type',
        header: () => t('columnType'),
        cell: ({ row }) => {
          const style = MOVEMENT_STYLES[row.original.movement_type];
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                style?.bg,
                style?.text,
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', style?.dot)} />
              {style?.labelKey ? t(style.labelKey) : row.original.movement_type}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('columnQuantity')}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const isPositive = row.original.quantity > 0;
          return (
            <div className="flex items-center justify-end gap-1">
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-status-success" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-status-error" />
              )}
              <span
                className={cn(
                  'font-mono text-sm font-bold tabular-nums',
                  isPositive ? 'text-status-success' : 'text-status-error',
                )}
              >
                {isPositive ? '+' : ''}
                {row.original.quantity}
              </span>
            </div>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        id: 'supplier_name',
        accessorFn: (row) => row.supplier?.name ?? '',
        header: () => t('columnSupplier'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary whitespace-nowrap">
            {row.original.supplier?.name || '-'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'author_name',
        accessorFn: (row) => row.author_name ?? '',
        header: () => t('columnAuthor'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary text-sm">{row.original.author_name || '-'}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'notes',
        header: () => t('columnNotes'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary max-w-48 truncate block">
            {row.original.notes || '-'}
          </span>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: formatDateShort/formatTime derive only from locale (already a dep), so listing their identities is redundant and would rebuild columns needlessly (2026-06-18)
    [locale, t],
  );
}
