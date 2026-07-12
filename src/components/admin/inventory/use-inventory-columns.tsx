'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingDown, Pencil } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { SortableHeader } from '@/components/admin/ResponsiveDataTable';
import { StatusBadge } from '@/components/admin/shared/StatusBadge';
import { formatCurrency } from '@/lib/utils/currency';
import { INGREDIENT_UNITS } from '@/types/inventory.types';
import type { Ingredient } from '@/types/inventory.types';
import type { CurrencyCode } from '@/types/admin.types';
import { getStockBadge } from './stock-badge';

export function useInventoryColumns(
  currency: string,
  openAdjust: (ing: Ingredient) => void,
  openEdit: (ing: Ingredient) => void,
  openLoss: (ing: Ingredient) => void,
) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return useMemo<ColumnDef<Ingredient, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader column={column}>{tc('product')}</SortableHeader>,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[220px]">
            <p className="truncate font-medium text-app-text">{row.original.name}</p>
            {row.original.category && (
              <p className="truncate text-xs text-app-text-secondary">{row.original.category}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'unit',
        header: () => tc('unit'),
        cell: ({ row }) => INGREDIENT_UNITS[row.original.unit]?.labelShort || row.original.unit,
        enableSorting: false,
      },
      {
        accessorKey: 'current_stock',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('currentStock')}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const ing = row.original;
          return (
            <span className="font-mono font-bold text-app-text">
              {ing.current_stock.toFixed(ing.unit === 'pièce' || ing.unit === 'bouteille' ? 0 : 2)}
            </span>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        accessorKey: 'min_stock_alert',
        header: () => t('minAlert'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">{row.original.min_stock_alert}</span>
        ),
        enableSorting: false,
        meta: { className: 'text-right' },
      },
      {
        accessorKey: 'cost_per_unit',
        header: ({ column }) => (
          <SortableHeader column={column} className="ml-auto">
            {t('costPerUnit')}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="text-app-text-secondary">
            {formatCurrency(row.original.cost_per_unit, currency as CurrencyCode)}
          </span>
        ),
        meta: { className: 'text-right' },
      },
      {
        id: 'status',
        header: () => <span className="w-full text-center block">{tc('status')}</span>,
        cell: ({ row }) => {
          const badge = getStockBadge(row.original, t);
          return (
            <div className="text-center">
              <StatusBadge tone={badge.tone} icon={badge.icon}>
                {badge.label}
              </StatusBadge>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="w-full text-right block">{tc('actions')}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAdjust(row.original)}
              className="text-xs"
            >
              +/-
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openLoss(row.original)}
              className="text-xs"
              aria-label={t('declareLoss')}
              title={t('declareLoss')}
            >
              <TrendingDown className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row.original)}
              className="text-xs"
              aria-label={tc('edit')}
              title={tc('edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: openAdjust/openEdit are stable dialog openers (only call setState); excluding them keeps the column defs from rebuilding on every render, and a stale reference is harmless here (2026-06-18)
    [currency, t, tc],
  );
}
