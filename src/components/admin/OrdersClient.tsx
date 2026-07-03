'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations, useFormatter } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders } from '@/hooks/queries';
import { useUpdateOrderStatus } from '@/hooks/mutations';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';
import { useSound } from '@/contexts/SoundContext';
import { ResponsiveDataTable } from '@/components/admin/ResponsiveDataTable';
import OrderDetails from '@/components/admin/OrderDetails';
import AdminModal from '@/components/admin/AdminModal';
import type { VisibilityState } from '@tanstack/react-table';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Order, CurrencyCode } from '@/types/admin.types';
import { useTenantSettings } from '@/hooks/queries/useTenantSettings';
import { fromMinorUnits } from '@/lib/utils/money';
import type { OrderStatus } from '@/lib/design-tokens';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import { useDevice } from '@/hooks/useDevice';
import { ListPagination } from '@/components/admin/ListPagination';
import type { ServerListPagination } from '@/lib/pagination';
import { useOrderStatusConfig } from '@/components/admin/orders/use-order-status-config';
import { useOrdersColumns } from '@/components/admin/orders/use-orders-columns';
import { useBulkDeleteOrders } from '@/components/admin/orders/use-bulk-delete-orders';
import OrdersToolbar from '@/components/admin/orders/OrdersToolbar';
import OrdersBulkActionBar from '@/components/admin/orders/OrdersBulkActionBar';
import OrdersBulkDeleteDialog from '@/components/admin/orders/OrdersBulkDeleteDialog';
import OrderMobileCard from '@/components/admin/orders/OrderMobileCard';

interface OrdersClientProps {
  tenantId: string;
  initialOrders: Order[];
  serverListPagination?: ServerListPagination;
}

export default function OrdersClient({
  tenantId,
  initialOrders,
  serverListPagination,
}: OrdersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const useServerPagination = !!serverListPagination;
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const tk = useTranslations('kitchen');
  const ts = useTranslations('shortcuts');
  const format = useFormatter();
  const { data: tenantSettings } = useTenantSettings(tenantId);
  const currency = (tenantSettings?.currency || 'XAF') as CurrencyCode;
  // Stable number formatter for SSR/CSR parity (avoids toLocaleString() hydration
  // mismatches). Order totals/tips are integer MINOR units, so convert to major
  // (identity for XAF) before formatting the bare number.
  const formatNumber = useCallback(
    (n: number) => format.number(fromMinorUnits(n, currency)),
    [format, currency],
  );

  // filteredOrders is derived via useMemo below
  const [statusFilter, setStatusFilter] = useSessionState<string>('orders:statusFilter', 'all');
  const [search, setSearch] = useSessionState('orders:search', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientPage, setClientPage] = useState(0);
  const PAGE_SIZE = serverListPagination?.pageSize ?? 50;
  const page = useServerPagination
    ? Math.max(
        0,
        Math.min(
          serverListPagination.page - 1,
          Math.ceil(serverListPagination.total / PAGE_SIZE) - 1,
        ),
      )
    : clientPage;

  const handleOrdersPageChange = useCallback(
    (pageIndex: number) => {
      if (useServerPagination) {
        const params = new URLSearchParams();
        if (pageIndex > 0) {
          params.set('page', String(pageIndex + 1));
        }
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
        return;
      }
      setClientPage(pageIndex);
    },
    [useServerPagination, router, pathname],
  );

  const { play: playNotification } = useSound();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrderStatus = useUpdateOrderStatus(tenantId);

  // TanStack Query for orders - use || to handle empty arrays from persistent cache
  const { data: queryOrders } = useOrders(tenantId, undefined, page, PAGE_SIZE);
  const orders = useMemo(
    () => (queryOrders?.length ? queryOrders : page === 0 ? initialOrders : []),
    [queryOrders, page, initialOrders],
  );

  // Realtime subscription via shared hook
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `orders_admin_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onInsert: (record) => {
      playNotification();
      toast({
        title: t('newOrderAlert'),
        description: `Table ${String(record.table_number ?? '')}`,
      });
    },
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
    },
  });

  // ── Contextual keyboard shortcuts ──
  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        id: 'orders-filter',
        label: ts('toggleFilters'),
        section: 'contextual',
        keys: ['f'],
        action: () => {
          const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
          if (searchInput) {
            searchInput.focus();
          }
        },
      },
    ],
    [ts],
  );
  useContextualShortcuts(shortcuts);

  // Filtering logic (derived state via useMemo)
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        result = result.filter((o) => ['pending', 'preparing', 'ready'].includes(o.status));
      } else {
        result = result.filter((o) => o.status === statusFilter);
      }
    }

    // Search filter (debounced)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (o) => (o.table_number ?? '').toLowerCase().includes(q) || o.id.includes(q),
      );
    }

    return result;
  }, [orders, statusFilter, debouncedSearch]);

  const getStatusConfig = useOrderStatusConfig();

  const handleStatusChange = useCallback(
    (orderId: string, newStatus: OrderStatus) => {
      updateOrderStatus.mutate({ orderId, status: newStatus });
    },
    [updateOrderStatus],
  );

  // TanStack Table column definitions
  const columns = useOrdersColumns({
    selectedIds,
    setSelectedIds,
    filteredOrders,
    setSelectedOrder,
    getStatusConfig,
    formatNumber,
    handleStatusChange,
  });

  const { handleBulkDelete, isDeleting } = useBulkDeleteOrders({
    tenantId,
    selectedIds,
    setSelectedIds,
    setShowDeleteConfirm,
  });

  // Hide less important columns on tablet portrait to prevent horizontal scroll
  const { isTablet } = useDevice();
  const columnVisibility = useMemo<VisibilityState>(
    () =>
      isTablet
        ? { select: false, server: false, items_count: false }
        : { select: true, server: true, items_count: true },
    [isTablet],
  );

  return (
    <RoleGuard permission="canViewAllOrders">
      <div className="h-full flex flex-col overflow-hidden">
        <h1 className="sr-only">{t('title')}</h1>
        <OrdersToolbar
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />

        <OrdersBulkActionBar
          selectedIds={selectedIds}
          orders={orders}
          getStatusConfig={getStatusConfig}
          handleStatusChange={handleStatusChange}
          setSelectedIds={setSelectedIds}
          setShowDeleteConfirm={setShowDeleteConfirm}
        />

        <OrdersBulkDeleteDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          selectedCount={selectedIds.size}
          isDeleting={isDeleting}
          onConfirm={handleBulkDelete}
        />

        {/* Orders Table / Cards */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingBag className="w-10 h-10 text-app-text-muted mb-3" />
              <p className="text-sm font-medium text-app-text-secondary mb-1">
                {t('noOrdersTitle') || 'No orders yet'}
              </p>
              <p className="text-xs text-app-text-muted">
                {t('noOrdersDesc') || 'Orders will appear here as they come in'}
              </p>
            </div>
          ) : (
            <ResponsiveDataTable
              columns={columns}
              data={filteredOrders}
              emptyMessage={t('noOrdersMatch')}
              onRowClick={(order) => setSelectedOrder(order)}
              storageKey="orders"
              columnVisibility={columnVisibility}
              mobileConfig={{
                renderCard: (order) => (
                  <OrderMobileCard
                    order={order}
                    getStatusConfig={getStatusConfig}
                    formatNumber={formatNumber}
                    handleStatusChange={handleStatusChange}
                  />
                ),
              }}
            />
          )}
        </div>

        {useServerPagination && serverListPagination ? (
          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={serverListPagination.total}
            onPageChange={handleOrdersPageChange}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOrdersPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              {tc('previous') || 'Precedent'}
            </Button>
            <span className="text-xs text-app-text-muted">
              {t('pageOf', { page: page + 1 }) || `Page ${page + 1}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOrdersPageChange(page + 1)}
              disabled={orders.length < PAGE_SIZE}
            >
              {tc('next') || 'Suivant'}
            </Button>
          </div>
        )}

        {/* Detail Modal */}
        <AdminModal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={`${tk('ticketOrder')} #${selectedOrder?.id.slice(0, 8)}`}
          size="lg"
        >
          {selectedOrder && (
            <OrderDetails
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onUpdate={() => {
                // Trigger a refresh logic if usually needed, but generic realtime handles it mostly.
                // We can force status update in local state here if specialized logic requires it.
              }}
              tenant={tenantSettings as Partial<import('@/types/admin.types').Tenant> | undefined}
              currency={(tenantSettings?.currency || 'XAF') as CurrencyCode}
            />
          )}
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
