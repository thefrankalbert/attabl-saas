'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Bell, Utensils, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { logger } from '@/lib/logger';
import type { Order, OrderStatus } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface UseKitchenDataParams {
  tenantId: string;
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
  orders: Order[];
  displayOrders: Order[];
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
  toggleFullscreen: () => void;
  loadOrders: () => Promise<void>;
  goBack: () => void;
}

// ─── Column style config (no translatable text) ────────────
const COLUMN_STYLES = {
  pending: {
    dot: 'bg-amber-400',
    countBadge: 'text-amber-400 bg-amber-400/10',
    colBg: 'bg-amber-500/[0.025]',
    emptyIcon: Bell,
  },
  preparing: {
    dot: 'bg-blue-400',
    countBadge: 'text-blue-400 bg-blue-400/10',
    colBg: 'bg-blue-500/[0.025]',
    emptyIcon: Utensils,
  },
  ready: {
    dot: 'bg-emerald-400',
    countBadge: 'text-emerald-400 bg-emerald-400/10',
    colBg: 'bg-emerald-500/[0.025]',
    emptyIcon: CheckCircle2,
  },
} as const;

// ─── Rich mock data for demo ─────────────────────────────────
const MOCK_ORDERS: Order[] = [
  {
    id: 'mock-1',
    order_number: '047',
    table_number: '12',
    status: 'pending',
    service_type: 'dine_in',
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    total_price: 28500,
    notes: 'Allergie aux noix \u2014 table VIP',
    items: [
      {
        id: 'm1',
        name: 'Tartare de Saumon',
        quantity: 2,
        price: 6500,
        item_status: 'pending',
        course: 'appetizer',
      },
      {
        id: 'm2',
        name: 'Entrec\u00f4te Grill\u00e9e',
        quantity: 1,
        price: 9500,
        item_status: 'pending',
        course: 'main',
        notes: 'Cuisson saignante',
        modifiers: [{ name: 'Sauce b\u00e9arnaise', price: 500 }],
      },
      {
        id: 'm3',
        name: 'Risotto Truffe',
        quantity: 1,
        price: 8500,
        item_status: 'pending',
        course: 'main',
      },
      {
        id: 'm4',
        name: 'Frites Maison',
        quantity: 2,
        price: 1750,
        item_status: 'pending',
        course: 'main',
      },
    ],
    tenant_id: 'mock',
  },
  {
    id: 'mock-2',
    order_number: '045',
    table_number: '05',
    status: 'preparing',
    service_type: 'dine_in',
    created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    total_price: 18000,
    items: [
      {
        id: 'm5',
        name: 'Pizza Margherita',
        quantity: 1,
        price: 8000,
        item_status: 'preparing',
        course: 'main',
        customer_notes: 'Sans olives, extra mozzarella',
      },
      {
        id: 'm6',
        name: 'Tiramisu',
        quantity: 2,
        price: 5000,
        item_status: 'pending',
        course: 'dessert',
      },
    ],
    tenant_id: 'mock',
  },
  {
    id: 'mock-4',
    order_number: '044',
    table_number: '03',
    status: 'preparing',
    service_type: 'takeaway',
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    total_price: 12000,
    items: [
      {
        id: 'm9',
        name: 'Burger Classic',
        quantity: 2,
        price: 4500,
        item_status: 'ready',
        course: 'main',
      },
      {
        id: 'm10',
        name: 'Onion Rings',
        quantity: 1,
        price: 3000,
        item_status: 'preparing',
        course: 'main',
      },
    ],
    tenant_id: 'mock',
  },
  {
    id: 'mock-3',
    order_number: '042',
    table_number: '08',
    status: 'ready',
    service_type: 'room_service',
    room_number: '304',
    created_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    total_price: 14500,
    items: [
      {
        id: 'm7',
        name: 'Salade C\u00e9sar',
        quantity: 1,
        price: 4500,
        item_status: 'ready',
        course: 'appetizer',
      },
      {
        id: 'm8',
        name: 'Fondant Chocolat',
        quantity: 2,
        price: 5000,
        item_status: 'ready',
        course: 'dessert',
      },
    ],
    tenant_id: 'mock',
  },
];

// ─── Hook ───────────────────────────────────────────────

export function useKitchenData({
  tenantId,
  notificationSoundId,
}: UseKitchenDataParams): UseKitchenDataReturn {
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMockData, setShowMockData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<ColumnKey>('pending');

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
  const router = useRouter();
  const supabase = createClient();

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
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data as Order[]);
      setLastUpdate(new Date());
    } catch (error) {
      logger.error('KDS loading error', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId]);

  // ─── Realtime subscription ──────────────────────────────
  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000);

    const channel = supabase
      .channel('kds_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            playNotification();
          }
          loadOrders();
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadOrders, playNotification, supabase, tenantId]);

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

  // ─── Fullscreen toggle ──────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };

  // ─── Derived data ───────────────────────────────────────
  const displayOrders = useMemo(() => {
    return showMockData || (orders.length === 0 && loading === false) ? MOCK_ORDERS : orders;
  }, [orders, showMockData, loading]);

  const pendingOrders = displayOrders.filter((o) => o.status === 'pending');
  const preparingOrders = displayOrders.filter((o) => o.status === 'preparing');
  const readyOrders = displayOrders.filter((o) => o.status === 'ready');

  const columnOrders: Record<ColumnKey, Order[]> = {
    pending: pendingOrders,
    preparing: preparingOrders,
    ready: readyOrders,
  };

  const totalActive = pendingOrders.length + preparingOrders.length + readyOrders.length;

  const goBack = () => router.back();

  return {
    // Data
    orders,
    displayOrders,
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
    toggleFullscreen,
    loadOrders,
    goBack,
  };
}
