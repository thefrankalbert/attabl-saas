'use client';

import { useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations, useLocale } from 'next-intl';
import { History, Search } from 'lucide-react';
import { useStockMovements } from '@/hooks/queries';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockMovement, MovementType } from '@/types/inventory.types';
import { MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';
import RoleGuard from '@/components/admin/RoleGuard';
import AnalyseTabs from '@/components/admin/AnalyseTabs';

interface StockHistoryClientProps {
  tenantId: string;
}

export default function StockHistoryClient({ tenantId }: StockHistoryClientProps) {
  const t = useTranslations('stockHistory');
  const tc = useTranslations('common');
  const locale = useLocale();

  const movementFilters: { value: MovementType | 'all'; label: string }[] = [
    { value: 'all', label: t('filterAll') },
    { value: 'order_destock', label: t('filterOrders') },
    { value: 'manual_add', label: t('filterAdditions') },
    { value: 'manual_remove', label: t('filterWithdrawals') },
    { value: 'adjustment', label: t('filterAdjustments') },
    { value: 'opening', label: t('filterOpening') },
  ];

  const [searchQuery, setSearchQuery] = useSessionState('stockHistory:searchQuery', '');
  const [filterType, setFilterType] = useSessionState<MovementType | 'all'>(
    'stockHistory:filterType',
    'all',
  );

  // TanStack Query for stock movements
  const { data: movements = [], isLoading: loading } = useStockMovements(tenantId);

  const filtered = movements.filter((m) => {
    const matchesType = filterType === 'all' || m.movement_type === filterType;
    const matchesSearch =
      !searchQuery ||
      m.ingredient?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<StockMovement, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column}>{t('columnDate')}</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-app-text-secondary whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'ingredient_name',
        accessorFn: (row) => row.ingredient?.name ?? '',
        header: ({ column }) => (
          <SortableHeader column={column}>{t('columnIngredient')}</SortableHeader>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-app-text">
            {row.original.ingredient?.name || '\u2014'}
            {row.original.ingredient?.unit && (
              <span className="text-app-text-muted ml-1 text-xs">
                ({row.original.ingredient.unit})
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'movement_type',
        header: () => t('columnType'),
        cell: ({ row }) => {
          const typeInfo = MOVEMENT_TYPE_LABELS[row.original.movement_type];
          return (
            <span
              className={cn('text-xs font-medium', typeInfo?.color || 'text-app-text-secondary')}
            >
              {typeInfo?.label || row.original.movement_type}
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
            <span
              className={cn(
                'font-mono font-medium',
                isPositive ? 'text-status-success' : 'text-status-error',
              )}
            >
              {isPositive ? '+' : ''}
              {row.original.quantity}
            </span>
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
            {row.original.supplier?.name || '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'notes',
        header: () => t('columnNotes'),
        cell: ({ row }) => (
          <span className="text-app-text-secondary max-w-[200px] break-words block">
            {row.original.notes || '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, t],
  );

  return (
    <RoleGuard permission="canViewStocks">
      <div className="h-full flex flex-col overflow-hidden">
        <AnalyseTabs />
        {loading ? (
          <div className="p-8 text-center text-app-text-secondary">{tc('loading')}</div>
        ) : (
          <>
            <div className="shrink-0 space-y-3">
              {/* Header — single line on desktop */}
              <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
                <h1 className="text-2xl font-bold text-app-text flex items-center gap-2 shrink-0">
                  <History className="w-6 h-6" />
                  {t('title')}
                  <span className="text-base font-normal text-app-text-secondary">
                    ({filtered.length})
                  </span>
                </h1>

                <div className="relative w-full @lg:w-56 @xl:w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                  <Input
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto shrink-0">
                  {movementFilters.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFilterType(f.value)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                        filterType === f.value
                          ? 'bg-app-text text-accent-text'
                          : 'bg-app-bg text-app-text-secondary hover:bg-app-elevated',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
              {/* Table / Cards */}
              <ResponsiveDataTable
                columns={columns}
                data={filtered}
                emptyMessage={t('noMovements')}
                storageKey="stockHistory"
                mobileConfig={{
                  renderCard: (movement) => {
                    const typeInfo = MOVEMENT_TYPE_LABELS[movement.movement_type];
                    const isPositive = movement.quantity > 0;
                    return (
                      <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-2">
                        {/* Row 1: Ingredient + Date */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-app-text break-words">
                            {movement.ingredient?.name || '\u2014'}
                            {movement.ingredient?.unit && (
                              <span className="text-app-text-muted ml-1 text-xs">
                                ({movement.ingredient.unit})
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-app-text-muted whitespace-nowrap shrink-0">
                            {formatDate(movement.created_at)}
                          </span>
                        </div>

                        {/* Row 2: Type + Quantity */}
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'text-xs font-medium',
                              typeInfo?.color || 'text-app-text-secondary',
                            )}
                          >
                            {typeInfo?.label || movement.movement_type}
                          </span>
                          <span
                            className={cn(
                              'font-mono font-bold',
                              isPositive ? 'text-status-success' : 'text-status-error',
                            )}
                          >
                            {isPositive ? '+' : ''}
                            {movement.quantity}
                          </span>
                        </div>

                        {/* Row 3: Supplier + Notes */}
                        {(movement.supplier?.name || movement.notes) && (
                          <div className="text-xs text-app-text-secondary break-words">
                            {movement.supplier?.name && <span>{movement.supplier.name}</span>}
                            {movement.supplier?.name && movement.notes && <span> — </span>}
                            {movement.notes && <span>{movement.notes}</span>}
                          </div>
                        )}
                      </div>
                    );
                  },
                }}
              />
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
