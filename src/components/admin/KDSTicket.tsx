'use client';

import { useEffect, useState } from 'react';
import { Timer, Flame, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { Order, OrderItem, ItemStatus, OrderStatus } from '@/types/admin.types';
import RuptureButton from '@/components/admin/RuptureButton';

interface KDSTicketProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onUpdate?: () => void;
  isMock?: boolean;
}

// Course labels in French with emoji
const COURSE_LABELS: Record<string, { emoji: string; label: string; order: number }> = {
  appetizer: { emoji: '\ud83e\udd57', label: 'Entr\u00e9es', order: 1 },
  main: { emoji: '\ud83c\udf56', label: 'Plats', order: 2 },
  dessert: { emoji: '\ud83c\udf70', label: 'Desserts', order: 3 },
  drink: { emoji: '\ud83e\udd64', label: 'Boissons', order: 4 },
};

// Service type badges
const SERVICE_TYPE_BADGES: Record<string, { emoji: string; label: string }> = {
  dine_in: { emoji: '\ud83c\udf7d\ufe0f', label: 'Sur place' },
  takeaway: { emoji: '\ud83d\udce6', label: '\u00c0 emporter' },
  delivery: { emoji: '\ud83d\ude97', label: 'Livraison' },
  room_service: { emoji: '\ud83c\udfe8', label: 'Room service' },
};

// Item status config
const ITEM_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'En attente', bg: 'bg-gray-500/20', text: 'text-gray-400' },
  preparing: { label: 'En pr\u00e9pa', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  ready: { label: 'Pr\u00eat', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

// Item status cycle order
const ITEM_STATUS_CYCLE: Record<string, ItemStatus> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'pending', // cycle back
};

export default function KDSTicket({
  order,
  onStatusChange,
  onUpdate,
  isMock = false,
}: KDSTicketProps) {
  const [elapsed, setElapsed] = useState(0);
  const { toast } = useToast();

  // Resolve items: Supabase returns order_items from join, but Order type uses items
  const items: OrderItem[] =
    order.items || (order as unknown as { order_items?: OrderItem[] }).order_items || [];

  useEffect(() => {
    const calculate = () => {
      const diff = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
      setElapsed(diff);
    };
    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const minutes = Math.floor(elapsed / 60);
  const isLate = minutes >= 20;
  const isWarning = minutes >= 10 && minutes < 20;

  const statusConfig = {
    pending: { bg: 'bg-amber-500', label: 'En Attente', borderColor: 'border-amber-500/50' },
    preparing: {
      bg: 'bg-blue-500',
      label: 'En Pr\u00e9paration',
      borderColor: 'border-blue-500/50',
    },
    ready: {
      bg: 'bg-emerald-500',
      label: 'Pr\u00eat \u00e0 Servir',
      borderColor: 'border-emerald-500/50',
    },
    delivered: { bg: 'bg-gray-500', label: 'Servi', borderColor: 'border-gray-500/50' },
    cancelled: { bg: 'bg-red-500', label: 'Annul\u00e9', borderColor: 'border-red-500/50' },
  };

  const currentConfig = statusConfig[order.status] || statusConfig.pending;
  const timerColor = isLate
    ? 'bg-red-500 text-white'
    : isWarning
      ? 'bg-amber-500 text-white'
      : 'bg-emerald-500/20 text-emerald-400';

  const nextStatusMap: Record<string, OrderStatus> = {
    pending: 'preparing',
    preparing: 'ready',
    ready: 'delivered',
  };

  const actionLabel: Record<string, string> = {
    pending: 'D\u00c9MARRER',
    preparing: 'TERMINER',
    ready: 'SERVIR',
  };

  const actionColor: Record<string, string> = {
    pending: 'bg-amber-500 hover:bg-amber-600',
    preparing: 'bg-blue-500 hover:bg-blue-600',
    ready: 'bg-emerald-500 hover:bg-emerald-600',
  };

  const handleAction = () => {
    if (isMock) return;
    const nextStatus = nextStatusMap[order.status];
    if (nextStatus) onStatusChange(order.id, nextStatus);
  };

  // Update individual item status
  const updateItemStatus = async (itemId: string, newStatus: ItemStatus) => {
    if (isMock) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .eq('id', itemId);

    if (error) {
      toast({ title: 'Erreur de mise \u00e0 jour', variant: 'destructive' });
      return;
    }

    // Check if all items are ready
    const allReady = items.every((i) =>
      i.id === itemId ? newStatus === 'ready' : i.item_status === 'ready',
    );

    if (allReady && items.length > 0) {
      await supabase.from('orders').update({ status: 'ready' }).eq('id', order.id);
      toast({ title: 'Tous les articles sont pr\u00eats !' });
    }

    onUpdate?.();
  };

  const handleItemStatusClick = (item: OrderItem) => {
    const currentStatus = item.item_status || 'pending';
    const nextStatus = ITEM_STATUS_CYCLE[currentStatus] || 'pending';
    updateItemStatus(item.id, nextStatus);
  };

  // Mark all items as ready
  const handleMarkAllReady = async () => {
    if (isMock) return;

    const supabase = createClient();

    // Update all items to ready
    const itemIds = items.map((i) => i.id);
    if (itemIds.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .update({ item_status: 'ready' })
        .in('id', itemIds);

      if (itemsError) {
        toast({ title: 'Erreur de mise \u00e0 jour', variant: 'destructive' });
        return;
      }
    }

    // Update order status to ready
    const { error: orderError } = await supabase
      .from('orders')
      .update({ status: 'ready' })
      .eq('id', order.id);

    if (orderError) {
      toast({ title: 'Erreur de mise \u00e0 jour', variant: 'destructive' });
      return;
    }

    toast({ title: 'Commande marqu\u00e9e pr\u00eate !' });
    onUpdate?.();
  };

  // Group items by course
  const groupedItems = items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const course = item.course || 'main'; // default to 'main' if no course set
    if (!acc[course]) acc[course] = [];
    acc[course].push(item);
    return acc;
  }, {});

  // Sort courses by defined order
  const sortedCourses = Object.keys(groupedItems).sort((a, b) => {
    const orderA = COURSE_LABELS[a]?.order ?? 99;
    const orderB = COURSE_LABELS[b]?.order ?? 99;
    return orderA - orderB;
  });

  // Service type badge
  const serviceType = order.service_type;
  const serviceBadge = serviceType ? SERVICE_TYPE_BADGES[serviceType] : null;

  // Order number display
  // Customer notes (from order level)
  const customerNotes = order.notes;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-300 bg-slate-900',
        currentConfig.borderColor,
        isLate && 'animate-pulse border-red-500',
        isMock && 'opacity-90',
      )}
    >
      {/* Status Bar */}
      <div className={cn('h-1.5 w-full', currentConfig.bg)} />

      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <span className="font-mono text-xl font-black text-white">{order.table_number}</span>
            </div>
            <div>
              {order.order_number && (
                <p className="font-mono text-lg font-black text-white">#{order.order_number}</p>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Table {order.table_number}
                </span>
                <span className="text-[10px] text-slate-600">
                  {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div
              className={cn(
                'px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-all min-w-[80px] justify-center',
                timerColor,
                isLate && 'animate-pulse',
              )}
            >
              {isLate ? <Flame className="w-3.5 h-3.5" /> : <Timer className="w-3.5 h-3.5" />}
              <span className="font-mono text-sm font-black tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>
          </div>
        </div>

        {/* Service Type Badge */}
        {serviceBadge && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                serviceType === 'dine_in' &&
                  'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                serviceType === 'takeaway' &&
                  'bg-orange-500/10 text-orange-400 border border-orange-500/20',
                serviceType === 'delivery' &&
                  'bg-purple-500/10 text-purple-400 border border-purple-500/20',
                serviceType === 'room_service' &&
                  'bg-pink-500/10 text-pink-400 border border-pink-500/20',
              )}
            >
              <span>{serviceBadge.emoji}</span>
              <span>{serviceBadge.label}</span>
            </span>
            {serviceType === 'room_service' && order.room_number && (
              <span className="text-[10px] font-bold text-pink-400">
                Chambre {order.room_number}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Customer Notes */}
      {customerNotes && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start gap-1.5 text-yellow-400">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-wide leading-tight">
              {customerNotes}
            </p>
          </div>
        </div>
      )}

      {/* Items List - Grouped by Course */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[320px] bg-slate-900/50 custom-scrollbar">
        {sortedCourses.map((course) => {
          const courseConfig = COURSE_LABELS[course] || {
            emoji: '\ud83c\udf7d\ufe0f',
            label: course,
            order: 99,
          };
          const courseItems = groupedItems[course];

          return (
            <div key={course}>
              {/* Course Header */}
              {sortedCourses.length > 1 && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs">{courseConfig.emoji}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {courseConfig.label}
                  </span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
              )}

              {/* Items */}
              <div className="space-y-1.5">
                {courseItems.map((item) => {
                  const itemStatus = item.item_status || 'pending';
                  const statusConf = ITEM_STATUS_CONFIG[itemStatus] || ITEM_STATUS_CONFIG.pending;

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-2 rounded-lg bg-white/5 border border-white/5"
                    >
                      <div className="w-6 h-6 flex-shrink-0 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="font-mono text-xs font-black text-white">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                          {!isMock && item.menu_item_id && (
                            <RuptureButton
                              menuItemId={item.menu_item_id}
                              itemName={item.name}
                              onRupture={onUpdate}
                            />
                          )}
                        </div>

                        {/* Modifiers in blue */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="mt-0.5">
                            {item.modifiers.map((mod, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] text-blue-400 font-medium mr-2"
                              >
                                +{mod.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Item notes */}
                        {(item.notes || item.customer_notes) && (
                          <div className="mt-1 flex items-start gap-1.5 text-amber-400">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <p className="text-[10px] font-bold uppercase tracking-wide leading-tight">
                              {item.customer_notes || item.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Item Status Badge - Clickable to cycle */}
                      <button
                        onClick={() => handleItemStatusClick(item)}
                        disabled={isMock}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-all shrink-0',
                          statusConf.bg,
                          statusConf.text,
                          !isMock && 'hover:opacity-80 cursor-pointer active:scale-95',
                        )}
                      >
                        {statusConf.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-center py-4 text-slate-600 text-xs">Aucun article</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col">
        {/* "Tout pr\u00eat" button */}
        {order.status !== 'ready' && order.status !== 'delivered' && items.length > 0 && (
          <button
            onClick={handleMarkAllReady}
            disabled={isMock}
            className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-t border-white/5 transition-all flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tout pr\u00eat</span>
          </button>
        )}

        {/* Main action button */}
        {actionLabel[order.status] && (
          <button
            onClick={handleAction}
            className={cn(
              'w-full py-3 font-black text-[10px] uppercase tracking-widest text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2',
              actionColor[order.status],
            )}
          >
            <span>{actionLabel[order.status]}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
