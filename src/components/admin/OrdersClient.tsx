'use client';

import { useState, useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders } from '@/hooks/queries';
import { useUpdateOrderStatus } from '@/hooks/mutations';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Search, Volume2, VolumeX, ChevronRight, Eye } from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import OrderDetails from '@/components/admin/OrderDetails';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Order, OrderStatus } from '@/types/admin.types';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

interface OrdersClientProps {
  tenantId: string;
  initialOrders: Order[];
  notificationSoundId?: string;
}

export default function OrdersClient({
  tenantId,
  initialOrders,
  notificationSoundId,
}: OrdersClientProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');
  const tk = useTranslations('kitchen');
  const ts = useTranslations('shortcuts');

  // filteredOrders is derived via useMemo below
  const [statusFilter, setStatusFilter] = useSessionState<string>('orders:statusFilter', 'all');
  const [search, setSearch] = useSessionState('orders:search', '');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const {
    soundEnabled,
    toggleSound,
    play: playNotification,
    audioRef,
  } = useNotificationSound({
    soundId: notificationSoundId,
    tenantId,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrderStatus = useUpdateOrderStatus(tenantId);

  // TanStack Query for orders
  const { data: queryOrders } = useOrders(tenantId);
  const orders = queryOrders ?? initialOrders;

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

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((o) => o.table_number.toLowerCase().includes(q) || o.id.includes(q));
    }

    return result;
  }, [orders, statusFilter, search]);

  // Status badge config
  const statusConfig: Record<
    OrderStatus,
    {
      label: string;
      bg: string;
      nextStatus: OrderStatus | null;
      nextLabel: string | null;
      actionBg: string;
    }
  > = useMemo(
    () => ({
      pending: {
        label: t('statusPendingCard'),
        bg: 'bg-amber-500/10 text-amber-500',
        nextStatus: 'preparing',
        nextLabel: t('actionPrepare'),
        actionBg: 'bg-amber-500',
      },
      preparing: {
        label: t('statusPreparingCard'),
        bg: 'bg-blue-500/10 text-blue-500',
        nextStatus: 'ready',
        nextLabel: t('actionReady'),
        actionBg: 'bg-blue-500',
      },
      ready: {
        label: t('statusReadyCard'),
        bg: 'bg-emerald-500/10 text-emerald-500',
        nextStatus: 'delivered',
        nextLabel: t('actionDeliver'),
        actionBg: 'bg-emerald-500',
      },
      delivered: {
        label: t('statusDeliveredCard'),
        bg: 'bg-slate-500/10 text-slate-500',
        nextStatus: null,
        nextLabel: null,
        actionBg: '',
      },
      cancelled: {
        label: t('statusCancelledCard'),
        bg: 'bg-red-500/10 text-red-500',
        nextStatus: null,
        nextLabel: null,
        actionBg: '',
      },
    }),
    [t],
  );

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        accessorKey: 'table_number',
        header: ({ column }) => (
          <SortableHeader column={column}>{t('searchTable').replace('...', '')}</SortableHeader>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-app-bg rounded-lg flex items-center justify-center font-bold text-app-text text-xs">
              {row.original.table_number}
            </div>
            <span className="font-medium text-app-text">{row.original.table_number}</span>
          </div>
        ),
      },
      {
        accessorFn: (row: Order) => row.server?.full_name ?? '—',
        id: 'server',
        header: ({ column }) => <SortableHeader column={column}>{t('serverLabel')}</SortableHeader>,
        cell: ({ getValue }) => (
          <span className="text-sm text-app-text-muted">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column}>{t('dateColumn')}</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-app-text-secondary text-xs whitespace-nowrap">
            {new Date(row.original.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: () => tc('status'),
        cell: ({ row }) => {
          const config = statusConfig[row.original.status];
          return (
            <span className={cn('px-2 py-1 rounded-full text-xs font-bold', config.bg)}>
              {config.label}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: 'items_count',
        header: () => t('orderDetails'),
        cell: ({ row }) => {
          const items = row.original.items || [];
          return (
            <span className="text-app-text-secondary text-sm">
              {items.length} {items.length === 1 ? tc('item') : tc('items')}
            </span>
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
          return (
            <span className="font-mono font-bold text-app-text">{total.toLocaleString()}</span>
          );
        },
        meta: { className: 'text-right' },
      },
      {
        id: 'actions',
        header: () => <span className="w-full text-right block">{tc('actions')}</span>,
        cell: ({ row }) => {
          const order = row.original;
          const config = statusConfig[order.status];
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
                  className={cn(
                    'text-xs text-white gap-1 min-h-[44px]',
                    config.actionBg,
                    `hover:${config.actionBg}/90`,
                  )}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, statusConfig],
  );

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus.mutate({ orderId, status: newStatus });
  };

  return (
    <RoleGuard permission="canViewAllOrders">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-3">
          {/* Hidden Audio */}
          <audio ref={audioRef} preload="auto" />

          {/* Header — single line on desktop */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <h1 className="text-2xl font-bold text-app-text tracking-tight shrink-0">
              {ta('ordersCount')}
              <span className="text-base font-normal text-app-text-secondary ml-2">
                ({orders.length})
              </span>
            </h1>

            <div className="relative w-full lg:w-56 xl:w-64 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-text-muted" />
              <Input
                data-search-input
                placeholder={t('searchTable')}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleSound}
              className={cn('shrink-0', soundEnabled && 'text-primary border-primary bg-primary/5')}
              title={soundEnabled ? tc('soundEnabled') : tc('soundDisabled')}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>

          {/* Status filter tabs */}
          <div className="overflow-x-auto scrollbar-hide">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
              <TabsList>
                <TabsTrigger value="all">{t('tabAll')}</TabsTrigger>
                <TabsTrigger value="active">{t('tabInProgress')}</TabsTrigger>
                <TabsTrigger value="pending">{t('tabPending')}</TabsTrigger>
                <TabsTrigger value="preparing">{t('tabInKitchen')}</TabsTrigger>
                <TabsTrigger value="ready">{t('tabReady')}</TabsTrigger>
                <TabsTrigger value="delivered">{t('tabCompleted')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Orders Table / Cards */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          <ResponsiveDataTable
            columns={columns}
            data={filteredOrders}
            emptyMessage={t('noOrdersMatch')}
            onRowClick={(order) => setSelectedOrder(order)}
            storageKey="orders"
            mobileConfig={{
              renderCard: (order) => {
                const config = statusConfig[order.status];
                const total = order.total_price ?? order.total ?? order.total_amount ?? 0;
                const items = order.items || [];
                return (
                  <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3 active:bg-app-bg transition-colors">
                    {/* Row 1: Table + Status + Time */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-app-bg rounded-lg flex items-center justify-center font-bold text-app-text text-xs">
                          {order.table_number}
                        </div>
                        <span className="font-semibold text-app-text">{order.table_number}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-app-text-muted">
                          {new Date(order.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className={cn('px-2 py-1 rounded-full text-xs font-bold', config.bg)}>
                          {config.label}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Server + Items + Total */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-app-text-muted truncate">
                        {order.server?.full_name ?? '—'}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-app-text-secondary">
                          {items.length} {items.length === 1 ? tc('item') : tc('items')}
                        </span>
                        <span className="font-mono font-bold text-app-text">
                          {total.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Row 3: Actions */}
                    {config.nextStatus && (
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(order.id, config.nextStatus!);
                          }}
                          className={cn(
                            'text-xs text-white gap-1 min-h-[44px]',
                            config.actionBg,
                            `hover:${config.actionBg}/90`,
                          )}
                        >
                          {config.nextLabel} <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              },
            }}
          />
        </div>

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
            />
          )}
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
