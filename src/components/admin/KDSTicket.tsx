'use client';

import { useEffect, useState } from 'react';
import {
  Flame,
  AlertTriangle,
  CheckCircle2,
  Package,
  Hotel,
  Truck,
  UtensilsCrossed,
  Clock,
  CircleDot,
  Pause,
  Check,
  Play,
  ChevronRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
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

const ITEM_NEXT: Record<string, ItemStatus> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'pending',
};

export default function KDSTicket({
  order,
  onStatusChange,
  onUpdate,
  isMock = false,
}: KDSTicketProps) {
  const [elapsed, setElapsed] = useState(0);
  const { toast } = useToast();
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');
  const to = useTranslations('orders');

  // ─── Course labels ──────────────────────────────────────────
  const COURSE_LABELS: Record<string, { emoji: string; label: string; order: number }> = {
    appetizer: { emoji: '\u{1F957}', label: t('courseStarters'), order: 1 },
    main: { emoji: '\u{1F356}', label: t('courseMains'), order: 2 },
    dessert: { emoji: '\u{1F370}', label: t('courseDesserts'), order: 3 },
    drink: { emoji: '\u{1F964}', label: t('courseDrinks'), order: 4 },
  };

  // ─── Service type config ────────────────────────────────────
  const SERVICE_TYPES: Record<
    string,
    { icon: React.ComponentType<{ className?: string }>; label: string }
  > = {
    dine_in: { icon: UtensilsCrossed, label: t('serviceOnSite') },
    takeaway: { icon: Package, label: t('serviceTakeaway') },
    delivery: { icon: Truck, label: t('serviceDelivery') },
    room_service: { icon: Hotel, label: t('serviceRoom') },
  };

  // ─── Item status ────────────────────────────────────────────
  const ITEM_STATUSES: Record<
    string,
    {
      label: string;
      dot: string;
      text: string;
      bg: string;
    }
  > = {
    pending: {
      label: t('itemPending'),
      dot: 'bg-neutral-400',
      text: 'text-neutral-400',
      bg: 'bg-neutral-400/10 hover:bg-neutral-400/20',
    },
    preparing: {
      label: t('itemPreparing'),
      dot: 'bg-yellow-400',
      text: 'text-yellow-400',
      bg: 'bg-yellow-400/10 hover:bg-yellow-400/20',
    },
    ready: {
      label: t('itemReady'),
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
      bg: 'bg-emerald-400/10 hover:bg-emerald-400/20',
    },
  };

  // ─── Order status → visual config ───────────────────────────
  const STATUS_CONFIG = {
    pending: {
      headerBg: 'bg-amber-500',
      headerText: 'text-white',
      icon: Play,
      statusLabel: t('columnPending'),
      actionBg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600',
      actionLabel: t('actionStart').toUpperCase(),
      next: 'preparing' as OrderStatus,
    },
    preparing: {
      headerBg: 'bg-blue-500',
      headerText: 'text-white',
      icon: Pause,
      statusLabel: t('columnPreparing'),
      actionBg: 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600',
      actionLabel: t('actionFinish').toUpperCase(),
      next: 'ready' as OrderStatus,
    },
    ready: {
      headerBg: 'bg-emerald-500',
      headerText: 'text-white',
      icon: Check,
      statusLabel: t('columnReady'),
      actionBg: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600',
      actionLabel: t('actionServe').toUpperCase(),
      next: 'delivered' as OrderStatus,
    },
    delivered: {
      headerBg: 'bg-neutral-600',
      headerText: 'text-white',
      icon: Check,
      statusLabel: to('delivered'),
      actionBg: '',
      actionLabel: '',
      next: undefined,
    },
    cancelled: {
      headerBg: 'bg-red-500',
      headerText: 'text-white',
      icon: CircleDot,
      statusLabel: to('cancelled'),
      actionBg: '',
      actionLabel: '',
      next: undefined,
    },
  } as const;

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

  const formatElapsedHuman = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return tc('justNow');
    if (hours >= 1) return tc('hoursShort', { count: hours });
    return tc('minutesShort', { count: mins });
  };

  const minutes = Math.floor(elapsed / 60);
  const isLate = minutes >= 20;
  const isWarning = minutes >= 10 && minutes < 20;

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  // ─── Actions ────────────────────────────────────────────────
  const handleAction = () => {
    if (isMock) return;
    if (cfg.next) onStatusChange(order.id, cfg.next);
  };

  const updateItemStatus = async (itemId: string, newStatus: ItemStatus) => {
    if (isMock) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .eq('id', itemId);

    if (error) {
      toast({ title: tc('updateError'), variant: 'destructive' });
      return;
    }

    const allReady = items.every((i) =>
      i.id === itemId ? newStatus === 'ready' : i.item_status === 'ready',
    );

    if (allReady && items.length > 0) {
      await supabase.from('orders').update({ status: 'ready' }).eq('id', order.id);
      toast({ title: t('allItemsReady') });
    }

    onUpdate?.();
  };

  const handleItemClick = (item: OrderItem) => {
    const current = item.item_status || 'pending';
    updateItemStatus(item.id, ITEM_NEXT[current] || 'pending');
  };

  const handleMarkAllReady = async () => {
    if (isMock) return;

    const supabase = createClient();
    const itemIds = items.map((i) => i.id);

    if (itemIds.length > 0) {
      const { error } = await supabase
        .from('order_items')
        .update({ item_status: 'ready' })
        .in('id', itemIds);

      if (error) {
        toast({ title: tc('updateError'), variant: 'destructive' });
        return;
      }
    }

    const { error } = await supabase.from('orders').update({ status: 'ready' }).eq('id', order.id);

    if (error) {
      toast({ title: tc('updateError'), variant: 'destructive' });
      return;
    }

    toast({ title: t('orderMarkedReady') });
    onUpdate?.();
  };

  // ─── Group items by course ─────────────────────────────────
  const groupedItems = items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const course = item.course || 'main';
    if (!acc[course]) acc[course] = [];
    acc[course].push(item);
    return acc;
  }, {});

  const sortedCourses = Object.keys(groupedItems).sort((a, b) => {
    return (COURSE_LABELS[a]?.order ?? 99) - (COURSE_LABELS[b]?.order ?? 99);
  });

  // Progress
  const readyCount = items.filter((i) => i.item_status === 'ready').length;
  const progress = items.length > 0 ? Math.round((readyCount / items.length) * 100) : 0;

  const serviceType = order.service_type;
  const svc = serviceType ? SERVICE_TYPES[serviceType] : null;

  const timerColor = isLate ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-neutral-500';

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl overflow-hidden transition-all duration-300 bg-neutral-900/90 border border-white/[0.06]',
        isLate && 'ring-1 ring-red-500/40',
        isMock && 'opacity-90',
      )}
    >
      {/* ━━━ COLORED HEADER BANNER ━━━ */}
      <div className={cn('px-3 py-2.5', cfg.headerBg, cfg.headerText)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <StatusIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {order.order_number ? (
                  <span className="font-mono text-sm font-black">
                    COMMANDE #{order.order_number}
                  </span>
                ) : (
                  <span className="text-sm font-black uppercase tracking-wide">
                    {cfg.statusLabel}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-medium opacity-80 truncate">
                {formatElapsedHuman(elapsed)}
                {order.customer_name && ` · ${order.customer_name}`}
              </p>
            </div>
          </div>
          {svc && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/15 shrink-0">
              <svc.icon className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-wide">{svc.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ INFO ROW ━━━ */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-white/[0.04] bg-neutral-800/30">
        {/* Table */}
        <div className="flex items-center gap-1.5">
          <UtensilsCrossed className="w-3.5 h-3.5 text-neutral-500" />
          <span className="font-mono text-sm font-black text-white">{order.table_number}</span>
        </div>
        {/* Order # */}
        {order.order_number && (
          <div className="flex items-center gap-1.5">
            <CircleDot className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-mono text-sm font-bold text-neutral-300">
              {order.order_number}
            </span>
          </div>
        )}
        {/* Room */}
        {serviceType === 'room_service' && order.room_number && (
          <div className="flex items-center gap-1.5">
            <Hotel className="w-3.5 h-3.5 text-pink-400" />
            <span className="text-xs font-bold text-pink-400">{order.room_number}</span>
          </div>
        )}
        {/* Timer — pushed right */}
        <div className={cn('flex items-center gap-1 ml-auto', timerColor)}>
          {isLate ? <Flame className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          <span className="font-mono text-sm font-black tabular-nums">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* ━━━ Customer Notes ━━━ */}
      {order.notes && (
        <div className="px-3 py-2 bg-yellow-500/[0.07] border-b border-yellow-500/10">
          <div className="flex items-start gap-1.5 text-yellow-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold leading-snug">{order.notes}</p>
          </div>
        </div>
      )}

      {/* ━━━ ITEMS LIST ━━━ */}
      <div className="flex-1 overflow-y-auto max-h-[280px] custom-scrollbar">
        {sortedCourses.map((course) => {
          const courseConf = COURSE_LABELS[course] || {
            emoji: '\u{1F37D}\u{FE0F}',
            label: course,
            order: 99,
          };
          const courseItems = groupedItems[course];

          return (
            <div key={course}>
              {sortedCourses.length > 1 && (
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                  <span className="text-[10px]">{courseConf.emoji}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-600">
                    {courseConf.label}
                  </span>
                  <div className="flex-1 h-px bg-neutral-800/50" />
                </div>
              )}

              {courseItems.map((item) => {
                const st = ITEM_STATUSES[item.item_status || 'pending'] || ITEM_STATUSES.pending;
                const hasNotes = item.notes || item.customer_notes;
                const hasMods = item.modifiers && item.modifiers.length > 0;

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 px-3 py-1.5 border-b border-white/[0.02] last:border-b-0"
                  >
                    {/* Qty + Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] text-neutral-400 font-medium shrink-0">
                          {item.quantity} x
                        </span>
                        <span className="text-[13px] font-bold text-white leading-tight truncate">
                          {item.name}
                        </span>
                        {!isMock && item.menu_item_id && (
                          <RuptureButton
                            menuItemId={item.menu_item_id}
                            itemName={item.name}
                            onRupture={onUpdate}
                          />
                        )}
                      </div>
                      {hasMods && (
                        <div className="flex flex-wrap gap-x-2 ml-6 mt-0.5">
                          {item.modifiers!.map((mod, idx) => (
                            <span key={idx} className="text-[10px] text-blue-400 font-medium">
                              +{mod.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {hasNotes && (
                        <p className="text-[10px] text-amber-400/80 font-medium ml-6 mt-0.5 italic">
                          {item.customer_notes || item.notes}
                        </p>
                      )}
                    </div>

                    {/* Status badge — clickable to cycle */}
                    <button
                      onClick={() => handleItemClick(item)}
                      disabled={isMock}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all',
                        st.bg,
                        st.text,
                        !isMock && 'cursor-pointer active:scale-95',
                      )}
                    >
                      <div className={cn('w-1.5 h-1.5 rounded-full', st.dot)} />
                      {st.label}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-center py-6 text-neutral-600 text-xs">{tc('noItems')}</div>
        )}
      </div>

      {/* ━━━ PROGRESS BAR ━━━ */}
      {items.length > 0 && progress > 0 && (
        <div className="px-3 py-1.5 border-t border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  progress === 100 ? 'bg-emerald-400' : 'bg-blue-400',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-neutral-500 tabular-nums">
              {readyCount}/{items.length}
            </span>
          </div>
        </div>
      )}

      {/* ━━━ ACTIONS ━━━ */}
      <div className="flex">
        {/* "Tout prêt" shortcut */}
        {order.status !== 'ready' && order.status !== 'delivered' && items.length > 0 && (
          <button
            onClick={handleMarkAllReady}
            disabled={isMock}
            className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/[0.06] hover:bg-emerald-400/[0.12] border-t border-r border-white/[0.04] transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('actionAllReady')}
          </button>
        )}

        {/* Main action — BIG touch target */}
        {cfg.actionLabel && (
          <button
            onClick={handleAction}
            disabled={isMock}
            className={cn(
              'flex-1 py-2.5 font-black text-xs uppercase tracking-[0.15em] text-white transition-all active:scale-[0.98] flex items-center justify-center gap-1.5',
              cfg.actionBg,
            )}
          >
            {cfg.actionLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
