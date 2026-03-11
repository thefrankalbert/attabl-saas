'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Volume2,
  VolumeX,
  ChevronRight,
  Eye,
  ShoppingBag,
  Check,
  Lock,
  Trash2,
} from 'lucide-react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { SOUND_LIBRARY } from '@/lib/sounds/sound-library';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ResponsiveDataTable, SortableHeader } from '@/components/admin/ResponsiveDataTable';
import OrderDetails from '@/components/admin/OrderDetails';
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Order, CurrencyCode } from '@/types/admin.types';
import { STATUS_STYLES } from '@/lib/design-tokens';
import { useTenantSettings } from '@/hooks/queries/useTenantSettings';
import type { OrderStatus } from '@/lib/design-tokens';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import { useDevice } from '@/hooks/useDevice';
import { actionDeleteOrders } from '@/app/actions/orders';
import { logger } from '@/lib/logger';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: tenantSettings } = useTenantSettings(tenantId);

  const {
    soundEnabled,
    toggleSound,
    play: playNotification,
    preview: previewSound,
    currentSoundId,
    setSoundId,
    audioRef,
  } = useNotificationSound({
    soundId: notificationSoundId,
    tenantId,
  });

  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const { plan } = useSubscription();
  const isPremium = plan === 'premium';

  const handleSoundPointerDown = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setShowSoundPicker(true);
    }, 500);
  }, []);

  const handleSoundPointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      toggleSound();
    }
  }, [toggleSound]);

  const handleSoundPointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrderStatus = useUpdateOrderStatus(tenantId);

  // TanStack Query for orders — use || to handle empty arrays from persistent cache
  const { data: queryOrders } = useOrders(tenantId);
  const orders = queryOrders?.length ? queryOrders : initialOrders;

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

  // Status badge config — uses semantic design tokens for colors
  const statusConfig: Record<
    string,
    {
      label: string;
      bg: string;
      text: string;
      nextStatus: OrderStatus | null;
      nextLabel: string | null;
      actionDot: string;
    }
  > = useMemo(
    () => ({
      pending: {
        label: t('statusPendingCard'),
        bg: STATUS_STYLES.pending.bg,
        text: STATUS_STYLES.pending.text,
        nextStatus: 'preparing',
        nextLabel: t('actionPrepare'),
        actionDot: STATUS_STYLES.pending.dot,
      },
      preparing: {
        label: t('statusPreparingCard'),
        bg: STATUS_STYLES.preparing.bg,
        text: STATUS_STYLES.preparing.text,
        nextStatus: 'ready',
        nextLabel: t('actionReady'),
        actionDot: STATUS_STYLES.preparing.dot,
      },
      ready: {
        label: t('statusReadyCard'),
        bg: STATUS_STYLES.ready.bg,
        text: STATUS_STYLES.ready.text,
        nextStatus: 'delivered',
        nextLabel: t('actionDeliver'),
        actionDot: STATUS_STYLES.ready.dot,
      },
      delivered: {
        label: t('statusDeliveredCard'),
        bg: STATUS_STYLES.delivered.bg,
        text: STATUS_STYLES.delivered.text,
        nextStatus: null,
        nextLabel: null,
        actionDot: '',
      },
      cancelled: {
        label: t('statusCancelledCard'),
        bg: STATUS_STYLES.cancelled.bg,
        text: STATUS_STYLES.cancelled.text,
        nextStatus: null,
        nextLabel: null,
        actionDot: '',
      },
    }),
    [t],
  );

  // TanStack Table column definitions
  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={
              filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id))
            }
            onChange={(e) => {
              const next = new Set(selectedIds);
              if (e.target.checked) {
                filteredOrders.forEach((o) => next.add(o.id));
              } else {
                filteredOrders.forEach((o) => next.delete(o.id));
              }
              setSelectedIds(next);
            }}
            className="rounded border-app-border text-accent focus:ring-accent/30"
          />
        ),
        cell: ({ row }: { row: { original: Order } }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={(e) => {
              e.stopPropagation();
              const next = new Set(selectedIds);
              if (e.target.checked) next.add(row.original.id);
              else next.delete(row.original.id);
              setSelectedIds(next);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-app-border text-accent focus:ring-accent/30"
          />
        ),
        enableSorting: false,
      },
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
            {row.original.preparation_zone === 'bar' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">
                BAR
              </span>
            )}
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
            <span
              className={cn('px-2 py-1 rounded-full text-xs font-bold', config.bg, config.text)}
            >
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
          const summary = items
            .slice(0, 3)
            .map((i) => `${i.quantity}× ${i.name}`)
            .join(', ');
          const remaining = items.length - 3;
          return (
            <div className="max-w-[220px]">
              <span className="text-app-text text-sm line-clamp-1">
                {summary}
                {remaining > 0 && <span className="text-app-text-muted"> +{remaining}</span>}
              </span>
              <span className="text-app-text-muted text-xs block">
                {items.reduce((sum, i) => sum + i.quantity, 0)} {tc('items')}
              </span>
            </div>
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
          const tip = row.original.tip_amount ?? 0;
          return (
            <div className="text-right">
              <span className="font-mono font-bold text-app-text">
                {(total + tip).toLocaleString()}
              </span>
              {tip > 0 && (
                <span className="block text-[10px] text-emerald-500 font-medium">
                  +{tip.toLocaleString()} {ta('tipLabel')}
                </span>
              )}
            </div>
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
                    'text-xs text-accent-text gap-1 min-h-[44px]',
                    config.actionDot,
                    `hover:opacity-90`,
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
    [t, tc, statusConfig, selectedIds, filteredOrders],
  );

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus.mutate({ orderId, status: newStatus });
  };

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsDeleting(true);
    try {
      const result = await actionDeleteOrders(ids);

      if (result.error) {
        logger.error('Bulk delete orders failed', new Error(result.error), { orderIds: ids });
        toast({
          title: t('bulkDeleteError'),
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('bulkDeleteSuccess', { count: result.deletedCount ?? ids.length }),
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
    } catch (err) {
      logger.error('Bulk delete orders unexpected error', err as Error, { orderIds: ids });
      toast({
        title: t('bulkDeleteError'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedIds, tenantId, queryClient, toast, t]);

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
        <div className="shrink-0">
          {/* Hidden Audio */}
          <audio ref={audioRef} preload="auto" data-notification-audio />

          {/* Search + Tabs + Sound — wraps on mobile/tablet portrait */}
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
            <div className="relative w-full lg:w-auto lg:min-w-48 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-text-muted" />
              <Input
                data-search-input
                placeholder={t('searchTable')}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Tabs
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="shrink-0 max-w-full"
            >
              <TabsList className="overflow-x-auto scrollbar-hide">
                <TabsTrigger value="all">{t('tabAll')}</TabsTrigger>
                <TabsTrigger value="active">{t('tabInProgress')}</TabsTrigger>
                <TabsTrigger value="pending">{t('tabPending')}</TabsTrigger>
                <TabsTrigger value="preparing">{t('tabInKitchen')}</TabsTrigger>
                <TabsTrigger value="ready">{t('tabReady')}</TabsTrigger>
                <TabsTrigger value="delivered">{t('tabCompleted')}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative shrink-0 ml-auto">
              <Button
                variant="outline"
                size="icon"
                onPointerDown={handleSoundPointerDown}
                onPointerUp={handleSoundPointerUp}
                onPointerLeave={handleSoundPointerLeave}
                className={cn(
                  'select-none',
                  soundEnabled && 'text-accent border-accent bg-accent-muted',
                )}
                title={soundEnabled ? tc('soundEnabled') : tc('soundDisabled')}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>

              {/* Sound picker popover — opens on long press */}
              {showSoundPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSoundPicker(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-app-card border border-app-border rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-app-border">
                      <p className="text-xs font-bold text-app-text">
                        {t('soundPicker') || 'Sonnerie de notification'}
                      </p>
                    </div>
                    <div className="max-h-60 overflow-y-auto scrollbar-hide p-1.5 space-y-0.5">
                      {SOUND_LIBRARY.map((sound) => {
                        const isLocked = sound.isPremium && !isPremium;
                        const isActive = currentSoundId === sound.id;
                        return (
                          <button
                            key={sound.id}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                              if (!isLocked) {
                                setSoundId(sound.id);
                                previewSound(sound.id);
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors',
                              isActive
                                ? 'bg-accent-muted text-accent'
                                : 'text-app-text hover:bg-app-hover',
                              isLocked && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-medium break-words">
                                {sound.name}
                              </span>
                              <span className="block text-[10px] text-app-text-muted break-words">
                                {sound.description}
                              </span>
                            </span>
                            {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                            {isLocked && <Lock className="w-3 h-3 shrink-0 text-app-text-muted" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 mt-3 border border-app-border bg-app-elevated rounded-xl shadow-sm">
            <span className="text-sm font-medium text-app-text">
              {t('selected', { count: selectedIds.size })}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => {
                const ids = Array.from(selectedIds);
                ids.forEach((id) => {
                  const order = orders.find((o) => o.id === id);
                  if (order) {
                    const config = statusConfig[order.status];
                    if (config.nextStatus) {
                      handleStatusChange(id, config.nextStatus);
                    }
                  }
                });
                setSelectedIds(new Set());
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent text-accent-text hover:opacity-90 transition-colors"
            >
              {t('advanceStatus')}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {tc('delete')}
            </button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-app-card border border-app-border hover:bg-app-hover text-app-text-muted transition-colors"
            >
              {tc('cancel')}
            </button>
          </div>
        )}

        {/* Bulk delete confirmation dialog */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-app-text">
                {t('bulkDeleteConfirm', { count: selectedIds.size })}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-app-text-muted py-2">{t('bulkDeleteDesc')}</p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {tc('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? tc('loading') : tc('delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                renderCard: (order) => {
                  const config = statusConfig[order.status];
                  const total =
                    (order.total_price ?? order.total ?? order.total_amount ?? 0) +
                    (order.tip_amount ?? 0);
                  const items = order.items || [];
                  return (
                    <div className="border-b border-app-border py-4 space-y-3 active:bg-app-hover transition-colors">
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
                          <span
                            className={cn(
                              'px-2 py-1 rounded-full text-xs font-bold',
                              config.bg,
                              config.text,
                            )}
                          >
                            {config.label}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Item names summary */}
                      {items.length > 0 && (
                        <p className="text-xs text-app-text-secondary line-clamp-1">
                          {items
                            .slice(0, 3)
                            .map((i) => `${i.quantity}× ${i.name}`)
                            .join(', ')}
                          {items.length > 3 && (
                            <span className="text-app-text-muted"> +{items.length - 3}</span>
                          )}
                        </p>
                      )}

                      {/* Row 3: Server + Items count + Total */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-app-text-muted break-words">
                          {order.server?.full_name ?? '—'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-app-text-secondary">
                            {items.reduce((sum, i) => sum + i.quantity, 0)} {tc('items')}
                          </span>
                          <div className="text-right">
                            <span className="font-mono font-bold text-app-text">
                              {total.toLocaleString()}
                            </span>
                            {(order.tip_amount ?? 0) > 0 && (
                              <span className="block text-[10px] text-emerald-500 font-medium">
                                +{(order.tip_amount ?? 0).toLocaleString()} {ta('tipLabel')}
                              </span>
                            )}
                          </div>
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
                              'text-xs text-accent-text gap-1 min-h-[44px]',
                              config.actionDot,
                              `hover:opacity-90`,
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
              tenant={tenantSettings as Partial<import('@/types/admin.types').Tenant> | undefined}
              currency={(tenantSettings?.currency || 'XAF') as CurrencyCode}
            />
          )}
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
