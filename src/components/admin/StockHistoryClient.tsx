'use client';

import { useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MOVEMENT_STYLES as MOVEMENT_TOKENS } from '@/lib/design-tokens';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockMovement, MovementType } from '@/types/inventory.types';
import RoleGuard from '@/components/admin/RoleGuard';
import AnalyseTabs from '@/components/admin/AnalyseTabs';
import {
  StockHistoryEmpty,
  StockHistoryNoResults,
} from '@/components/admin/StockHistoryEmptyState';

// ─── Movement type visual config ─────────────────────────
const MOVEMENT_STYLES: Record<
  MovementType,
  { labelKey: string; icon: typeof Package; bg: string; text: string; dot: string }
> = {
  order_destock: {
    labelKey: 'filterOrders',
    icon: ClipboardList,
    bg: MOVEMENT_TOKENS.order_destock.bg,
    text: MOVEMENT_TOKENS.order_destock.text,
    dot: 'bg-status-info',
  },
  order_restock: {
    labelKey: 'filterRestock',
    icon: RefreshCw,
    bg: MOVEMENT_TOKENS.order_restock.bg,
    text: MOVEMENT_TOKENS.order_restock.text,
    dot: 'bg-status-success',
  },
  manual_add: {
    labelKey: 'filterAdditions',
    icon: Package,
    bg: MOVEMENT_TOKENS.manual_add.bg,
    text: MOVEMENT_TOKENS.manual_add.text,
    dot: 'bg-status-success',
  },
  manual_remove: {
    labelKey: 'filterWithdrawals',
    icon: Package,
    bg: MOVEMENT_TOKENS.manual_remove.bg,
    text: MOVEMENT_TOKENS.manual_remove.text,
    dot: 'bg-status-error',
  },
  adjustment: {
    labelKey: 'filterAdjustments',
    icon: RefreshCw,
    bg: MOVEMENT_TOKENS.adjustment.bg,
    text: MOVEMENT_TOKENS.adjustment.text,
    dot: 'bg-status-warning',
  },
  opening: {
    labelKey: 'filterOpening',
    icon: Truck,
    bg: MOVEMENT_TOKENS.opening.bg,
    text: MOVEMENT_TOKENS.opening.text,
    dot: 'bg-status-info',
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
  const pathname = usePathname();
  const inventoryHref = pathname.replace(/\/stock-history.*$/, '/inventory');

  const movementFilters = useMemo<{ value: MovementType | 'all'; label: string }[]>(
    () => [
      { value: 'all', label: t('filterAll') },
      { value: 'order_destock', label: t('filterOrders') },
      { value: 'order_restock', label: t('filterRestock') },
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

  const {
    data: movements = [],
    isLoading: loading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStockMovements(tenantId);

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

  return (
    <RoleGuard permission="canViewStocks">
      <div className="h-full flex flex-col overflow-hidden">
        <AnalyseTabs />

        {/* ── Header row ── */}
        <div className="shrink-0 space-y-4">
          <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
            <div className="flex flex-col gap-1 shrink-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-app-text tracking-tight">{t('title')}</h1>
                <span className="text-xs font-medium text-app-text-muted bg-app-elevated px-2 py-0.5 rounded-md tabular-nums">
                  {filtered.length}
                </span>
              </div>
              <p className="text-sm text-app-text-muted">{t('subtitle')}</p>
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
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {movementFilters.map((f) => {
              const isActive = filterType === f.value;
              return (
                <Button
                  key={f.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilterType(f.value)}
                  className={cn(
                    'inline-flex items-center px-3 py-1.5 h-auto text-xs rounded-lg whitespace-nowrap transition-colors border',
                    isActive
                      ? 'bg-app-text text-app-bg border-app-text font-semibold'
                      : 'bg-app-card text-app-text-secondary border-app-border/50 font-medium hover:border-app-border hover:bg-app-elevated hover:text-app-text',
                  )}
                >
                  {f.label}
                </Button>
              );
            })}
          </div>

          {/* ── Quick stats strip ── */}
          <div className="flex items-stretch rounded-xl border border-app-border/60 bg-app-card divide-x divide-app-border/60 overflow-hidden">
            <div className="flex-1 min-w-0 flex items-center gap-2.5 @sm:gap-3 px-3 @sm:px-4 py-3">
              <div className="hidden @sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
                <ArrowUpRight
                  className={cn(
                    'w-4 h-4',
                    stats.additions > 0 ? 'text-status-success' : 'text-app-text-muted',
                  )}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xl font-bold tabular-nums leading-none',
                    stats.additions > 0 ? 'text-status-success' : 'text-app-text-muted',
                  )}
                >
                  +{stats.additions}
                </p>
                <p className="mt-1 text-xs font-medium text-app-text-muted">
                  {t('statsAdditions')}
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 @sm:gap-3 px-3 @sm:px-4 py-3">
              <div className="hidden @sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
                <ArrowDownRight
                  className={cn(
                    'w-4 h-4',
                    stats.removals > 0 ? 'text-status-error' : 'text-app-text-muted',
                  )}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xl font-bold tabular-nums leading-none',
                    stats.removals > 0 ? 'text-status-error' : 'text-app-text-muted',
                  )}
                >
                  -{stats.removals}
                </p>
                <p className="mt-1 text-xs font-medium text-app-text-muted">{t('statsRemovals')}</p>
              </div>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 @sm:gap-3 px-3 @sm:px-4 py-3">
              <div className="hidden @sm:flex w-9 h-9 rounded-lg bg-app-elevated items-center justify-center shrink-0">
                <Box className="w-4 h-4 text-app-text-muted" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-app-text tabular-nums leading-none">
                  {stats.uniqueIngredients}
                </p>
                <p className="mt-1 text-xs font-medium text-app-text-muted">{t('statsProducts')}</p>
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
              <p className="text-sm text-status-error">{t('loadingError')}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {tc('retry')}
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            movements.length === 0 ? (
              <StockHistoryEmpty inventoryHref={inventoryHref} />
            ) : (
              <StockHistoryNoResults
                onClear={() => {
                  setFilterType('all');
                  setSearchQuery('');
                }}
              />
            )
          ) : (
            <>
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
                                {movement.ingredient?.name || '-'}
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
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? tc('loading') : tc('loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
