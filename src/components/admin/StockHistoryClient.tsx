'use client';

import { useMemo, useCallback } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations, useLocale } from 'next-intl';
import {
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Truck,
  RefreshCw,
  ClipboardList,
  Loader2,
  Box,
  BarChart3,
} from 'lucide-react';
import { useStockMovements } from '@/hooks/queries';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockMovement, MovementType } from '@/types/inventory.types';
import RoleGuard from '@/components/admin/RoleGuard';
import AnalyseTabs from '@/components/admin/AnalyseTabs';

// ─── Movement type visual config ─────────────────────────
const MOVEMENT_STYLES: Record<
  MovementType,
  { labelKey: string; icon: typeof Package; bg: string; text: string; dot: string }
> = {
  order_destock: {
    labelKey: 'filterOrders',
    icon: ClipboardList,
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  manual_add: {
    labelKey: 'filterAdditions',
    icon: Package,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  manual_remove: {
    labelKey: 'filterWithdrawals',
    icon: Package,
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  adjustment: {
    labelKey: 'filterAdjustments',
    icon: RefreshCw,
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  opening: {
    labelKey: 'filterOpening',
    icon: Truck,
    bg: 'bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
};

// ─── Component ──────────────────────────────────────────

interface StockHistoryClientProps {
  tenantId: string;
}

export default function StockHistoryClient({ tenantId }: StockHistoryClientProps) {
  const t = useTranslations('stockHistory');
  const tc = useTranslations('common');
  const locale = useLocale();

  const movementFilters = useMemo<{ value: MovementType | 'all'; label: string }[]>(
    () => [
      { value: 'all', label: t('filterAll') },
      { value: 'order_destock', label: t('filterOrders') },
      { value: 'manual_add', label: t('filterAdditions') },
      { value: 'manual_remove', label: t('filterWithdrawals') },
      { value: 'adjustment', label: t('filterAdjustments') },
      { value: 'opening', label: t('filterOpening') },
    ],
    [t],
  );

  const [searchQuery, setSearchQuery] = useSessionState('stockHistory:searchQuery', '');
  const [filterType, setFilterType] = useSessionState<MovementType | 'all'>(
    'stockHistory:filterType',
    'all',
  );

  const { data: movements = [], isLoading: loading, error } = useStockMovements(tenantId);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        const matchesType = filterType === 'all' || m.movement_type === filterType;
        const matchesSearch =
          !searchQuery ||
          m.ingredient?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.notes?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
      }),
    [movements, filterType, searchQuery],
  );

  const stats = useMemo(() => {
    const additions = filtered.filter((m) => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
    const removals = filtered
      .filter((m) => m.quantity < 0)
      .reduce((s, m) => s + Math.abs(m.quantity), 0);
    const uniqueIngredients = new Set(filtered.map((m) => m.ingredient?.name).filter(Boolean)).size;
    return { additions, removals, uniqueIngredients };
  }, [filtered]);

  const formatDate = useCallback(
    (dateStr: string) =>
      new Date(dateStr).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  const formatDateShort = useCallback(
    (dateStr: string) =>
      new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
    [locale],
  );

  const formatTime = useCallback(
    (dateStr: string) =>
      new Date(dateStr).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  );

  const columns = useMemo<ColumnDef<StockMovement, unknown>[]>(
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
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-app-elevated flex items-center justify-center shrink-0">
              <Box className="w-3.5 h-3.5 text-app-text-muted" />
            </div>
            <div className="min-w-0">
              <span className="font-medium text-sm text-app-text block truncate">
                {row.original.ingredient?.name || '\u2014'}
              </span>
              {row.original.ingredient?.unit && (
                <span className="text-[10px] text-app-text-muted uppercase tracking-wider">
                  {row.original.ingredient.unit}
                </span>
              )}
            </div>
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
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
              )}
              <span
                className={cn(
                  'font-mono text-sm font-bold tabular-nums',
                  isPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400',
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
          <span className="text-sm text-app-text-secondary">
            {row.original.supplier?.name || '\u2014'}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'notes',
        header: () => t('columnNotes'),
        cell: ({ row }) => (
          <span className="text-sm text-app-text-muted max-w-[200px] truncate block">
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

        {/* ── Header row ── */}
        <div className="shrink-0 space-y-4">
          <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <h1 className="text-xl font-bold text-app-text tracking-tight">{t('title')}</h1>
              <span className="text-xs font-medium text-app-text-muted bg-app-elevated px-2 py-0.5 rounded-md tabular-nums">
                {filtered.length}
              </span>
            </div>

            <div className="flex items-center gap-2 @lg:ml-auto">
              <div className="relative w-full @lg:w-52">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-app-text-muted" />
                <Input
                  placeholder={t('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm bg-app-elevated border-app-border/50 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ── Filter pills ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {movementFilters.map((f) => {
              const isActive = filterType === f.value;
              const style = f.value !== 'all' ? MOVEMENT_STYLES[f.value as MovementType] : null;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilterType(f.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-all border',
                    isActive
                      ? 'bg-app-text text-app-bg border-app-text shadow-sm'
                      : 'bg-app-card text-app-text-secondary border-app-border/50 hover:border-app-border hover:bg-app-elevated',
                  )}
                >
                  {style && !isActive && (
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* ── Quick stats strip ── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2.5 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
                  +{stats.additions}
                </p>
                <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                  {t('statsAdditions')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-lg">
              <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums leading-tight">
                  -{stats.removals}
                </p>
                <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                  {t('statsRemovals')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 bg-app-elevated border border-app-border/50 rounded-lg">
              <Box className="w-4 h-4 text-app-text-muted shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-app-text tabular-nums leading-tight">
                  {stats.uniqueIngredients}
                </p>
                <p className="text-[10px] font-medium text-app-text-muted uppercase tracking-wider">
                  {t('statsProducts')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Data area ── */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 text-app-text-muted animate-spin" />
              <p className="text-sm text-app-text-muted">{tc('loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <BarChart3 className="w-10 h-10 text-app-text-muted" />
              <p className="text-sm text-red-600">{t('loadingError')}</p>
            </div>
          ) : (
            <ResponsiveDataTable
              columns={columns}
              data={filtered}
              emptyMessage={t('noMovements')}
              storageKey="stockHistory"
              mobileConfig={{
                renderCard: (movement) => {
                  const style = MOVEMENT_STYLES[movement.movement_type];
                  const isPositive = movement.quantity > 0;
                  const Icon = style?.icon || Package;
                  return (
                    <div className="bg-app-card border border-app-border/60 rounded-xl p-3.5 space-y-2.5">
                      {/* Top: ingredient + quantity */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                              style?.bg,
                            )}
                          >
                            <Icon className={cn('w-4 h-4', style?.text)} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-app-text truncate">
                              {movement.ingredient?.name || '\u2014'}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-[10px] font-semibold',
                                  style?.text,
                                )}
                              >
                                <span className={cn('w-1 h-1 rounded-full', style?.dot)} />
                                {style?.labelKey ? t(style.labelKey) : ''}
                              </span>
                              {movement.ingredient?.unit && (
                                <span className="text-[10px] text-app-text-muted">
                                  {movement.ingredient.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isPositive ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                          )}
                          <span
                            className={cn(
                              'font-mono text-sm font-bold tabular-nums',
                              isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {isPositive ? '+' : ''}
                            {movement.quantity}
                          </span>
                        </div>
                      </div>

                      {/* Bottom: meta */}
                      <div className="flex items-center justify-between text-[11px] text-app-text-muted pt-1 border-t border-app-border/40">
                        <span>{formatDate(movement.created_at)}</span>
                        {movement.supplier?.name && (
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {movement.supplier.name}
                          </span>
                        )}
                      </div>

                      {movement.notes && (
                        <p className="text-[11px] text-app-text-muted italic truncate">
                          {movement.notes}
                        </p>
                      )}
                    </div>
                  );
                },
              }}
            />
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
