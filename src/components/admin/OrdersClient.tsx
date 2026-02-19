'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Search, Volume2, VolumeX, ChevronRight, Eye } from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { DataTable, SortableHeader } from '@/components/admin/DataTable';
import OrderDetails from '@/components/admin/OrderDetails';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { Order, OrderStatus } from '@/types/admin.types';

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

  // filteredOrders is derived via useMemo below
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
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
  const supabase = createClient();
  const queryClient = useQueryClient();

  // TanStack Query for orders
  const { data: queryOrders } = useOrders(tenantId);
  const orders = queryOrders ?? initialOrders;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            playNotification();
            const newOrder = payload.new as Record<string, unknown>;
            toast({
              title: t('newOrderAlert'),
              description: `Table ${newOrder.table_number}`,
            });
          }
          queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, playNotification, toast, t, queryClient]);

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
        bg: 'bg-amber-100 text-amber-700',
        nextStatus: 'preparing',
        nextLabel: t('actionPrepare'),
        actionBg: 'bg-amber-500',
      },
      preparing: {
        label: t('statusPreparingCard'),
        bg: 'bg-blue-100 text-blue-700',
        nextStatus: 'ready',
        nextLabel: t('actionReady'),
        actionBg: 'bg-blue-500',
      },
      ready: {
        label: t('statusReadyCard'),
        bg: 'bg-emerald-100 text-emerald-700',
        nextStatus: 'delivered',
        nextLabel: t('actionDeliver'),
        actionBg: 'bg-emerald-500',
      },
      delivered: {
        label: t('statusDeliveredCard'),
        bg: 'bg-slate-100 text-slate-500',
        nextStatus: null,
        nextLabel: null,
        actionBg: '',
      },
      cancelled: {
        label: t('statusCancelledCard'),
        bg: 'bg-red-100 text-red-500',
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
            <div className="w-8 h-8 bg-neutral-100 rounded-lg flex items-center justify-center font-bold text-neutral-900 text-xs">
              {row.original.table_number}
            </div>
            <span className="font-medium text-neutral-900">{row.original.table_number}</span>
          </div>
        ),
      },
      {
        accessorFn: (row: Order) => row.server?.full_name ?? '—',
        id: 'server',
        header: ({ column }) => <SortableHeader column={column}>{t('serverLabel')}</SortableHeader>,
        cell: ({ getValue }) => (
          <span className="text-sm text-neutral-400">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column}>{t('dateColumn')}</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-neutral-500 text-xs whitespace-nowrap">
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
            <span className="text-neutral-600 text-sm">
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
            <span className="font-mono font-bold text-neutral-900">{total.toLocaleString()}</span>
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
                onClick={() => setSelectedOrder(order)}
                className="text-xs gap-1"
              >
                <Eye className="w-3 h-3" />
              </Button>
              {config.nextStatus && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange(order.id, config.nextStatus!)}
                  className={cn(
                    'text-xs text-white gap-1',
                    config.actionBg,
                    `hover:${config.actionBg}/90`,
                  )}
                >
                  {config.nextLabel} <ChevronRight className="w-3 h-3" />
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

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) {
      toast({ title: tc('error'), variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', tenantId] });
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Hidden Audio */}
      <audio ref={audioRef} preload="auto" />

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{ta('ordersCount')}</h1>
          <p className="text-xs text-neutral-500 mt-1">{t('manageRealTime')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleSound}
            className={soundEnabled ? 'text-primary border-primary bg-primary/5' : ''}
            title={soundEnabled ? tc('soundEnabled') : tc('soundDisabled')}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
            <Input
              placeholder={t('searchTable')}
              className="pl-9 w-full sm:w-[200px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs / Filters */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
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

      {/* Orders Table */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        emptyMessage={t('noOrdersMatch')}
        onRowClick={(order) => setSelectedOrder(order)}
      />

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
  );
}
