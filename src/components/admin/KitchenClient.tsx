'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChefHat,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  Utensils,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import KDSTicket from './KDSTicket';
import type { Order, OrderStatus } from '@/types/admin.types';

interface KitchenClientProps {
  tenantId: string;
  notificationSoundId?: string;
}

// Mock Data
const MOCK_ORDERS: Order[] = [
  {
    id: 'mock-1',
    table_number: '12',
    status: 'pending',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    total_price: 15000,
    items: [
      { id: 'm1', name: 'Burger', quantity: 2, price: 5000 },
      { id: 'm2', name: 'Frites', quantity: 2, price: 2500 },
    ],
    tenant_id: 'mock',
  },
  {
    id: 'mock-2',
    table_number: '05',
    status: 'preparing',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    total_price: 8000,
    items: [{ id: 'm3', name: 'Pizza', quantity: 1, price: 8000, notes: 'Sans olives' }],
    tenant_id: 'mock',
  },
];

function StatCard({
  label,
  count,
  icon: Icon,
  color,
  pulse,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'amber' | 'blue' | 'emerald';
  pulse?: boolean;
}) {
  const styles = {
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  const iconBg = { amber: 'bg-amber-500', blue: 'bg-blue-500', emerald: 'bg-emerald-500' };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 rounded-lg border transition-all',
        styles[color],
        pulse && 'animate-pulse',
      )}
    >
      <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', iconBg[color])}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="font-mono text-2xl font-black tabular-nums">{count}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
      </div>
    </div>
  );
}

function EmptyColumn({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center opacity-50">
      <div className="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-sm font-bold text-slate-500">{label}</p>
    </div>
  );
}

export default function KitchenClient({ tenantId, notificationSoundId }: KitchenClientProps) {
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
  const supabase = createClient();

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
    } catch {
      console.error('Erreur chargement KDS');
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
      supabase.removeChannel(channel);
    };
  }, [loadOrders, playNotification, supabase, tenantId]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    // Optimistic
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

    try {
      await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      toast({ title: newStatus === 'ready' ? '✓ Commande prête !' : '✓ Statut mis à jour' });
      loadOrders();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
      loadOrders(); // Revert
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

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm font-medium opacity-70">Chargement du KDS...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen bg-slate-950 text-white flex flex-col font-sans overflow-hidden',
        isFullscreen && 'fixed inset-0 z-[100]',
      )}
    >
      <audio ref={audioRef} preload="auto" />

      {/* Header */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-slate-900 sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight">KDS</h1>
            <p className="text-[10px] text-slate-500">Kitchen Display System</p>
          </div>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-3">
          <StatCard
            label="en attente"
            count={pendingOrders.length}
            icon={AlertTriangle}
            color="amber"
            pulse={pendingOrders.length > 0}
          />
          <StatCard label="en cours" count={preparingOrders.length} icon={Clock} color="blue" />
          <StatCard label="prêts" count={readyOrders.length} icon={CheckCircle2} color="emerald" />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono mr-2 hidden sm:inline">
            MAJ: {lastUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={() => setShowMockData(!showMockData)}
            className={cn(
              'px-2 py-1 rounded text-[10px] border uppercase',
              showMockData
                ? 'bg-amber-500/20 text-amber-500 border-amber-500'
                : 'border-transparent text-slate-500',
            )}
          >
            {showMockData ? 'Demo On' : 'Demo Off'}
          </button>
          <button
            onClick={toggleSound}
            className={cn(
              'p-2 rounded-lg transition-all',
              soundEnabled ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Columns Headers */}
      <div className="hidden md:grid grid-cols-3 gap-px bg-slate-800 shrink-0 border-b border-white/5">
        <div className="bg-slate-900 py-2 px-3 flex items-center gap-2 border-r border-white/5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            En Attente
          </span>
          <span className="ml-auto bg-amber-500/10 text-amber-500 px-1.5 rounded text-[10px] font-bold">
            {pendingOrders.length}
          </span>
        </div>
        <div className="bg-slate-900 py-2 px-3 flex items-center gap-2 border-r border-white/5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            En Préparation
          </span>
          <span className="ml-auto bg-blue-500/10 text-blue-500 px-1.5 rounded text-[10px] font-bold">
            {preparingOrders.length}
          </span>
        </div>
        <div className="bg-slate-900 py-2 px-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Prêts</span>
          <span className="ml-auto bg-emerald-500/10 text-emerald-500 px-1.5 rounded text-[10px] font-bold">
            {readyOrders.length}
          </span>
        </div>
      </div>

      {/* Columns Content — 3 cols on md+, scrollable single column on small tablets */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800 overflow-hidden">
        {/* Pending */}
        <div className="bg-slate-950 overflow-y-auto p-3 space-y-3 custom-scrollbar md:border-r border-white/5">
          <div className="md:hidden flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              En Attente
            </span>
            <span className="ml-auto bg-amber-500/10 text-amber-500 px-1.5 rounded text-[10px] font-bold">
              {pendingOrders.length}
            </span>
          </div>
          {pendingOrders.length > 0 ? (
            pendingOrders.map((o) => (
              <KDSTicket
                key={o.id}
                order={o}
                onStatusChange={handleStatusChange}
                onUpdate={loadOrders}
                isMock={showMockData}
              />
            ))
          ) : (
            <EmptyColumn label="Aucune commande en attente" icon={Bell} />
          )}
        </div>

        {/* Preparing */}
        <div className="bg-slate-950 overflow-y-auto p-3 space-y-3 custom-scrollbar md:border-r border-white/5">
          <div className="md:hidden flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              En Préparation
            </span>
            <span className="ml-auto bg-blue-500/10 text-blue-500 px-1.5 rounded text-[10px] font-bold">
              {preparingOrders.length}
            </span>
          </div>
          {preparingOrders.length > 0 ? (
            preparingOrders.map((o) => (
              <KDSTicket
                key={o.id}
                order={o}
                onStatusChange={handleStatusChange}
                onUpdate={loadOrders}
                isMock={showMockData}
              />
            ))
          ) : (
            <EmptyColumn label="Rien en préparation" icon={Utensils} />
          )}
        </div>

        {/* Ready */}
        <div className="bg-slate-950 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          <div className="md:hidden flex items-center gap-2 mb-2 px-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Prêts</span>
            <span className="ml-auto bg-emerald-500/10 text-emerald-500 px-1.5 rounded text-[10px] font-bold">
              {readyOrders.length}
            </span>
          </div>
          {readyOrders.length > 0 ? (
            readyOrders.map((o) => (
              <KDSTicket
                key={o.id}
                order={o}
                onStatusChange={handleStatusChange}
                onUpdate={loadOrders}
                isMock={showMockData}
              />
            ))
          ) : (
            <EmptyColumn label="Aucune commande prête" icon={CheckCircle2} />
          )}
        </div>
      </div>
    </div>
  );
}
