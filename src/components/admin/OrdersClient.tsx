'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Search, Volume2, VolumeX, ListFilter } from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import OrderCard from '@/components/admin/OrderCard';
import OrderDetails from '@/components/admin/OrderDetails';
import AdminModal from '@/components/admin/AdminModal';
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

  const [orders, setOrders] = useState<Order[]>(initialOrders);
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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const { data } = await supabase
              .from('orders')
              .select('*, order_items(*)')
              .eq('id', payload.new.id)
              .single();
            if (data) {
              setOrders((prev) => [data as Order, ...prev]);
              playNotification();
              toast({ title: t('newOrderAlert'), description: `Table ${data.table_number}` });
            }
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, playNotification, toast, t]);

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

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    // Optimistic update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) {
      toast({ title: tc('error'), variant: 'destructive' });
      // Revert if error (would need real fetch to be perfect, but ok for now)
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

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
        {filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              onClick={() => setSelectedOrder(order)}
            />
          ))
        ) : (
          <div className="col-span-full py-12 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
            <ListFilter className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-neutral-900">{t('noOrdersMatch')}</h3>
            <p className="text-xs text-neutral-500 mt-1">{t('filterNoResults')}</p>
          </div>
        )}
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
  );
}
