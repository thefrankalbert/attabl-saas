'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { Bell, Utensils, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useFullscreen } from '@/hooks/useFullscreen';
import { logger } from '@/lib/logger';
import type { Order, OrderStatus, ItemStatus } from '@/types/admin.types';
import { MOCK_ORDERS } from '@/hooks/kitchen-mock-data';

// ─── Types ──────────────────────────────────────────────

interface UseKitchenDataParams {
  tenantId: string;
  /** @deprecated Sound is now managed globally via SoundContext */
  notificationSoundId?: string;
}

export interface ColumnConfig {
  dot: string;
  countBadge: string;
  colBg: string;
  emptyIcon: React.ComponentType<{ className?: string }>;
  label: string;
  emptyLabel: string;
}

export type ColumnKey = 'pending' | 'preparing' | 'ready';

export interface UseKitchenDataReturn {
  // Data
  pendingOrders: Order[];
  preparingOrders: Order[];
  readyOrders: Order[];
  columnOrders: Record<ColumnKey, Order[]>;
  totalActive: number;
  columns: Record<ColumnKey, ColumnConfig>;
  loading: boolean;

  // State
  showMockData: boolean;
  setShowMockData: (v: boolean) => void;
  lastUpdate: Date;
  isFullscreen: boolean;
  activeTab: ColumnKey;
  setActiveTab: (tab: ColumnKey) => void;

  // Sound
  soundEnabled: boolean;
  toggleSound: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;

  // Actions
  handleStatusChange: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  updateItemStatus: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  markAllItemsReady: (orderId: string, itemIds: string[]) => Promise<void>;
  toggleFullscreen: () => void;
  loadOrders: () => Promise<void>;
  goBack: () => void;
}

// ─── Column style config (no translatable text) ────────────
const COLUMN_STYLES = {
  pending: {
    dot: 'bg-amber-400/60',
    countBadge: 'text-neutral-300 bg-white/[0.05]',
    colBg: '',
    emptyIcon: Bell,
  },
  preparing: {
    dot: 'bg-blue-400/60',
    countBadge: 'text-neutral-300 bg-white/[0.05]',
    colBg: '',
    emptyIcon: Utensils,
  },
  ready: {
    dot: 'bg-emerald-400/60',
    countBadge: 'text-neutral-300 bg-white/[0.05]',
    colBg: '',
    emptyIcon: CheckCircle2,
  },
} as const;

// ─── Hook ───────────────────────────────────────────────

export function useKitchenData({ tenantId }: UseKitchenDataParams): UseKitchenDataReturn {
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMockData, setShowMockData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [activeTab, setActiveTab] = useSessionState<ColumnKey>('kitchen:activeTab', 'pending');

  const { soundEnabled, toggleSound, play: playNotification, audioRef } = useSound();

  const { toast } = useToast();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // ─── Columns with translated labels ─────────────────────
  const columns: Record<ColumnKey, ColumnConfig> = {
    pending: {
      ...COLUMN_STYLES.pending,
      label: t('columnPending'),
      emptyLabel: t('emptyPending'),
    },
    preparing: {
      ...COLUMN_STYLES.preparing,
      label: t('columnPreparing'),
      emptyLabel: t('emptyPreparing'),
    },
    ready: {
      ...COLUMN_STYLES.ready,
      label: t('columnReady'),
      emptyLabel: t('emptyReady'),
    },
  };

  // ─── Data fetching ──────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), server:admin_users!orders_server_id_fkey(id, full_name)')
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'preparing', 'ready'])
        .in('preparation_zone', ['kitchen', 'mixed']) // Exclude bar-only orders from KDS
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Map DB order_items (item_name, price_at_order) → OrderItem interface (name, price)
      const mapped = (data || []).map(
        (row: Record<string, unknown> & { order_items?: Array<Record<string, unknown>> }) => ({
          ...row,
          items: (row.order_items || []).map((oi) => ({
            id: oi.id as string,
            name: (oi.item_name as string) || '',
            quantity: (oi.quantity as number) || 1,
            price: (oi.price_at_order as number) || 0,
            menu_item_id: oi.menu_item_id as string | undefined,
            notes: oi.notes as string | undefined,
            customer_notes: oi.customer_notes as string | undefined,
            item_status: (oi.item_status as ItemStatus) || 'pending',
            course: oi.course as string | undefined,
            modifiers: oi.modifiers as Array<{ name: string; price: number }> | undefined,
          })),
        }),
      );

      setOrders(mapped as Order[]);
      setLastUpdate(new Date());
    } catch (error) {
      logger.error('KDS loading error', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId]);

  // ─── Initial load + polling fallback ────────────────────
  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 60000); // Polling as fallback only (realtime handles most updates)
    return () => clearInterval(interval);
  }, [loadOrders]);

  // ─── Realtime subscription via shared hook ─────────────
  // Optimised: only full-refetch on INSERT (needs joined data like order_items).
  // UPDATE: apply status change in-place (avoids re-fetching all orders).
  // DELETE: remove order from state directly.
  useRealtimeSubscription<Record<string, unknown>>({
    channelName: `kds_orders_${tenantId}`,
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`,
    onInsert: () => {
      playNotification();
      loadOrders();
    },
    onUpdate: (record) => {
      const updated = record as Record<string, unknown>;
      const id = updated.id as string | undefined;
      const newStatus = updated.status as OrderStatus | undefined;
      if (id && newStatus) {
        // Optimistic in-place status update — no refetch needed
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
        setLastUpdate(new Date());
      } else {
        // Fallback: field we don't handle → full reload
        loadOrders();
      }
    },
    onDelete: (oldRecord) => {
      const id = (oldRecord as Record<string, unknown>).id as string | undefined;
      if (id) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        setLastUpdate(new Date());
      } else {
        loadOrders();
      }
    },
  });

  // ─── Status mutation ────────────────────────────────────
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

    try {
      await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      toast({ title: newStatus === 'ready' ? t('actionAllReady') : ta('statusUpdated') });
      loadOrders();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
      loadOrders();
    }
  };

  // ─── Item-level mutations ──────────────────────────────
  const updateItemStatus = async (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ item_status: newStatus })
        .eq('id', itemId);

      if (error) {
        toast({ title: tc('error'), variant: 'destructive' });
        return;
      }

      const allReady = allItems.every((i) =>
        i.id === itemId ? newStatus === 'ready' : i.item_status === 'ready',
      );

      if (allReady && allItems.length > 0) {
        await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId);
        toast({ title: t('actionAllReady') });
      }

      loadOrders();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
      loadOrders();
    }
  };

  const markAllItemsReady = async (orderId: string, itemIds: string[]) => {
    try {
      if (itemIds.length > 0) {
        const { error } = await supabase
          .from('order_items')
          .update({ item_status: 'ready' })
          .in('id', itemIds);

        if (error) {
          toast({ title: tc('error'), variant: 'destructive' });
          return;
        }
      }

      const { error } = await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId);

      if (error) {
        toast({ title: tc('error'), variant: 'destructive' });
        return;
      }

      toast({ title: t('orderMarkedReady') });
      loadOrders();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
      loadOrders();
    }
  };

  // ─── Fullscreen (shared hook) ───────────────────────────

  // ─── Derived data ───────────────────────────────────────
  // Only show mock data when user explicitly toggles Demo mode
  const displayOrders = useMemo(() => {
    return showMockData ? MOCK_ORDERS : orders;
  }, [orders, showMockData]);

  const pendingOrders = displayOrders.filter((o) => o.status === 'pending');
  const preparingOrders = displayOrders.filter((o) => o.status === 'preparing');
  const readyOrders = displayOrders.filter((o) => o.status === 'ready');

  const columnOrders: Record<ColumnKey, Order[]> = {
    pending: pendingOrders,
    preparing: preparingOrders,
    ready: readyOrders,
  };

  const totalActive = pendingOrders.length + preparingOrders.length + readyOrders.length;

  const params = useParams();
  const goBack = () => {
    // If in fullscreen, just exit fullscreen (stay on page)
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    // Otherwise navigate back to dashboard
    const site = params?.site as string | undefined;
    router.push(site ? `/sites/${site}/admin` : '/');
  };

  return {
    // Data
    pendingOrders,
    preparingOrders,
    readyOrders,
    columnOrders,
    totalActive,
    columns,
    loading,

    // State
    showMockData,
    setShowMockData,
    lastUpdate,
    isFullscreen,
    activeTab,
    setActiveTab,

    // Sound
    soundEnabled,
    toggleSound,
    audioRef,

    // Actions
    handleStatusChange,
    updateItemStatus,
    markAllItemsReady,
    toggleFullscreen,
    loadOrders,
    goBack,
  };
}
