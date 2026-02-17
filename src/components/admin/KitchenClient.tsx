'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChefHat,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  Bell,
  Utensils,
  CheckCircle2,
  Flame,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import KDSTicket from './KDSTicket';
import type { Order, OrderStatus } from '@/types/admin.types';

interface KitchenClientProps {
  tenantId: string;
  notificationSoundId?: string;
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
    notes: 'Allergie aux noix — table VIP',
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
        name: 'Entrecôte Grillée',
        quantity: 1,
        price: 9500,
        item_status: 'pending',
        course: 'main',
        notes: 'Cuisson saignante',
        modifiers: [{ name: 'Sauce béarnaise', price: 500 }],
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
        name: 'Salade César',
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

function EmptyColumn({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-neutral-800/40 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-neutral-700" />
      </div>
      <p className="text-sm font-semibold text-neutral-600">{label}</p>
    </div>
  );
}

export default function KitchenClient({ tenantId, notificationSoundId }: KitchenClientProps) {
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMockData, setShowMockData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const COLUMNS = {
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

  const loadOrders = useCallback(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false));
      }
    }
  };

  const displayOrders = useMemo(() => {
    return showMockData || (orders.length === 0 && loading === false) ? MOCK_ORDERS : orders;
  }, [orders, showMockData, loading]);

  const pendingOrders = displayOrders.filter((o) => o.status === 'pending');
  const preparingOrders = displayOrders.filter((o) => o.status === 'preparing');
  const readyOrders = displayOrders.filter((o) => o.status === 'ready');

  const columnOrders = {
    pending: pendingOrders,
    preparing: preparingOrders,
    ready: readyOrders,
  };

  const totalActive = pendingOrders.length + preparingOrders.length + readyOrders.length;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-neutral-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm font-medium text-neutral-500">{t('loadingKds')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-neutral-950 text-white flex flex-col overflow-hidden">
      <audio ref={audioRef} preload="auto" />

      {/* ━━━ HEADER ━━━ */}
      <header className="h-12 border-b border-white/[0.06] flex items-center justify-between px-3 bg-neutral-900/90 backdrop-blur-sm shrink-0">
        {/* Left: Logo + counters */}
        <div className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-amber-400" />
          <span className="font-black text-sm tracking-tight mr-1">KDS</span>

          {/* Inline status counters */}
          <div className="flex items-center gap-1">
            {pendingOrders.length > 0 && (
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/10',
                  pendingOrders.length > 3 && 'animate-pulse',
                )}
              >
                {pendingOrders.length > 3 && <Flame className="w-3 h-3 text-amber-400" />}
                <span className="font-mono text-[11px] font-black text-amber-400 tabular-nums">
                  {pendingOrders.length}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-400/10">
              <span className="font-mono text-[11px] font-black text-blue-400 tabular-nums">
                {preparingOrders.length}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-400/10">
              <span className="font-mono text-[11px] font-black text-emerald-400 tabular-nums">
                {readyOrders.length}
              </span>
            </div>
            <span className="text-[10px] text-neutral-600 ml-1 hidden md:inline tabular-nums font-mono">
              {t('inProgress', { count: totalActive })}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-600 font-mono mr-1 hidden sm:inline tabular-nums">
            {lastUpdate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <button
            onClick={() => setShowMockData(!showMockData)}
            className={cn(
              'px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors',
              showMockData
                ? 'bg-amber-400/20 text-amber-400'
                : 'text-neutral-600 hover:text-neutral-400',
            )}
          >
            Demo
          </button>
          <button
            onClick={toggleSound}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              soundEnabled
                ? 'bg-amber-400/20 text-amber-400'
                : 'text-neutral-600 hover:text-neutral-400',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-400 transition-colors ml-1"
            title={t('backToDashboard')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ━━━ 3-COLUMN GRID ━━━ */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
        {(Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).map((key, idx) => {
          const col = COLUMNS[key];
          const colOrders = columnOrders[key];

          return (
            <div
              key={key}
              className={cn(
                'flex flex-col overflow-hidden',
                col.colBg,
                idx < 2 && 'md:border-r border-white/[0.04]',
              )}
            >
              {/* Column Header */}
              <div className="py-2 px-3 flex items-center gap-2 border-b border-white/[0.04] shrink-0 bg-neutral-900/30">
                <div className={cn('w-2 h-2 rounded-full', col.dot)} />
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500">
                  {col.label}
                </span>
                <span
                  className={cn(
                    'ml-auto px-2 py-0.5 rounded-md text-[11px] font-black tabular-nums',
                    col.countBadge,
                  )}
                >
                  {colOrders.length}
                </span>
              </div>

              {/* Column Content */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
                {colOrders.length > 0 ? (
                  colOrders.map((o) => (
                    <KDSTicket
                      key={o.id}
                      order={o}
                      onStatusChange={handleStatusChange}
                      onUpdate={loadOrders}
                      isMock={showMockData}
                    />
                  ))
                ) : (
                  <EmptyColumn label={col.emptyLabel} icon={col.emptyIcon} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
