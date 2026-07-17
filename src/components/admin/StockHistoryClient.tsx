'use client';

import { useState, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations, useLocale } from 'next-intl';
import { Search, BarChart3, Users } from 'lucide-react';
import { ListRowsSkeleton } from '@/components/admin/skeletons/ListRowsSkeleton';
import { useStockMovements } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import type { MovementType } from '@/types/inventory.types';
import RoleGuard from '@/components/admin/RoleGuard';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  StockHistoryEmpty,
  StockHistoryNoResults,
} from '@/components/admin/StockHistoryEmptyState';
import StaffStockReportDialog from '@/components/admin/StaffStockReportDialog';
import { useStockHistoryColumns } from '@/components/admin/stock-history/useStockHistoryColumns';
import StockHistoryMobileCard from '@/components/admin/stock-history/StockHistoryMobileCard';
import StockHistoryFilters from '@/components/admin/stock-history/StockHistoryFilters';
import StockHistoryStats from '@/components/admin/stock-history/StockHistoryStats';

// --- Component ------------------------------------------

interface StockHistoryClientProps {
  tenantId: string;
}

export default function StockHistoryClient({ tenantId }: StockHistoryClientProps) {
  const t = useTranslations('stockHistory');
  const tc = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const inventoryHref = pathname.replace(/\/stock-history.*$/, '/inventory');

  const [staffReportOpen, setStaffReportOpen] = useState(false);

  const movementFilters = useMemo<{ value: MovementType | 'all'; label: string }[]>(
    () => [
      { value: 'all', label: t('filterAll') },
      { value: 'order_destock', label: t('filterOrders') },
      { value: 'order_restock', label: t('filterRestock') },
      { value: 'manual_add', label: t('filterAdditions') },
      { value: 'manual_remove', label: t('filterWithdrawals') },
      { value: 'adjustment', label: t('filterAdjustments') },
      { value: 'opening', label: t('filterOpening') },
      { value: 'physical_count', label: t('filterPhysicalCount') },
      { value: 'loss', label: t('filterLoss') },
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
    // Round accumulated sums to kg precision - summing floats (0.1 + 0.05 + ...)
    // otherwise surfaces artifacts like -62.10999999999998 in the UI.
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const additions = round3(
      filtered.filter((m) => m.quantity > 0).reduce((s, m) => s + m.quantity, 0),
    );
    const removals = round3(
      filtered.filter((m) => m.quantity < 0).reduce((s, m) => s + Math.abs(m.quantity), 0),
    );
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

  const columns = useStockHistoryColumns({ locale, formatDateShort, formatTime });

  return (
    <RoleGuard permission="canViewStocks">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {/* -- Header row -- */}
        <div className="shrink-0 space-y-4">
          <AdminPageHeader
            title={t('title')}
            actions={
              <div className="flex items-center gap-2 w-full xl:w-auto">
                <div className="relative flex-1 xl:w-52">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-app-text-muted" />
                  <Input
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-base md:text-sm bg-app-elevated border-app-border/50 rounded-lg"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 shrink-0"
                  onClick={() => setStaffReportOpen(true)}
                  aria-label={t('staffReportCta')}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('staffReportCta')}</span>
                </Button>
              </div>
            }
          />

          {/* -- Filter pills -- */}
          <StockHistoryFilters
            filters={movementFilters}
            filterType={filterType}
            onSelect={setFilterType}
          />

          {/* -- Quick stats strip -- */}
          <StockHistoryStats stats={stats} />
        </div>

        {/* -- Data area -- */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
          {loading ? (
            <ListRowsSkeleton />
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
                  renderCard: (movement) => (
                    <StockHistoryMobileCard movement={movement} formatDate={formatDate} />
                  ),
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

      <StaffStockReportDialog
        tenantId={tenantId}
        open={staffReportOpen}
        onOpenChange={setStaffReportOpen}
      />
    </RoleGuard>
  );
}
