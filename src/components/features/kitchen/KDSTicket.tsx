'use client';

import { useEffect, useState } from 'react';
import {
  Flame,
  AlertTriangle,
  Package,
  Hotel,
  Truck,
  Clock,
  Check,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Order, OrderItem, ItemStatus, OrderStatus, Course } from '@/types/admin.types';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';
import RuptureButton from '@/components/admin/RuptureButton';

const COURSE_ORDER: Course[] = ['appetizer', 'main', 'dessert', 'drink'];

const COURSE_LABELS: Record<string, string> = {
  appetizer: 'ENTREES',
  main: 'PLATS',
  dessert: 'DESSERTS',
  drink: 'BOISSONS',
};

type UrgencyLevel = 'fresh' | 'normal' | 'aging' | 'late' | 'critical';

function getUrgency(minutes: number): UrgencyLevel {
  if (minutes < 5) return 'fresh';
  if (minutes < 10) return 'normal';
  if (minutes < 15) return 'aging';
  if (minutes < 20) return 'late';
  return 'critical';
}

const URGENCY_CARD_STYLES: Record<UrgencyLevel, string> = {
  fresh: 'border-l-4 border-emerald-500',
  normal: '',
  aging: 'border-l-4 border-amber-400',
  late: 'border-l-4 border-orange-500 bg-orange-500/5',
  critical: 'border-l-4 border-red-500 bg-red-500/5',
};

const URGENCY_TIMER_STYLES: Record<UrgencyLevel, string> = {
  fresh: '',
  normal: '',
  aging: 'text-amber-400',
  late: 'text-orange-400',
  critical: 'text-red-400 animate-pulse',
};

interface KDSTicketProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  onMarkAllReady?: (orderId: string, itemIds: string[]) => Promise<void>;
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
  onUpdateItemStatus,
  onMarkAllReady,
  onUpdate,
  isMock = false,
}: KDSTicketProps) {
  const [elapsed, setElapsed] = useState(0);
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');

  // ─── Service type config ────────────────────────────────────
  const SERVICE_ICONS: Record<
    string,
    { icon: React.ComponentType<{ className?: string }>; label: string }
  > = {
    takeaway: { icon: Package, label: t('serviceTakeaway') },
    delivery: { icon: Truck, label: t('serviceDelivery') },
    room_service: { icon: Hotel, label: t('serviceRoom') },
  };

  // ─── Item status badges ────────────────────────────────────
  const ITEM_BADGES: Record<string, { dot: string; text: string; bg: string }> = {
    pending: {
      dot: 'bg-app-text-muted',
      text: 'text-app-text-muted',
      bg: 'bg-app-elevated hover:bg-app-hover',
    },
    preparing: {
      dot: 'bg-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    },
    ready: {
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    },
  };

  // ─── Order status → visual config ─────────────────────────
  const STATUS_CONFIG = {
    pending: {
      headerBg: 'bg-amber-500',
      headerText: 'text-black',
      actionBg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600',
      actionLabel: t('actionStart').toUpperCase(),
      next: 'preparing' as OrderStatus,
    },
    preparing: {
      headerBg: 'bg-blue-500',
      headerText: 'text-white',
      actionBg: 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600',
      actionLabel: t('actionFinish').toUpperCase(),
      next: 'ready' as OrderStatus,
    },
    ready: {
      headerBg: 'bg-emerald-500',
      headerText: 'text-white',
      actionBg: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600',
      actionLabel: t('actionServe').toUpperCase(),
      next: 'delivered' as OrderStatus,
    },
    delivered: {
      headerBg: 'bg-app-elevated',
      headerText: 'text-app-text-secondary',
      actionBg: '',
      actionLabel: '',
      next: undefined,
    },
    cancelled: {
      headerBg: 'bg-red-900/60',
      headerText: 'text-red-300',
      actionBg: '',
      actionLabel: '',
      next: undefined,
    },
  } as const;

  // Filter out bar-only items: KDS shows only kitchen and both-zone items
  const allItems: OrderItem[] =
    order.items || (order as { order_items?: OrderItem[] }).order_items || [];
  const items = allItems.filter((item) => {
    const zone = item.preparation_zone || 'kitchen';
    return zone !== 'bar';
  });

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
  const urgency = getUrgency(minutes);

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

  // ─── Actions ────────────────────────────────────────────────
  const handleAction = () => {
    if (isMock) return;
    if (cfg.next) onStatusChange(order.id, cfg.next);
  };

  const handleItemClick = (item: OrderItem) => {
    if (isMock) return;
    const current = item.item_status || 'pending';
    const newStatus = ITEM_NEXT[current] || 'pending';
    onUpdateItemStatus?.(order.id, item.id, newStatus, items);
  };

  const handleMarkAllReady = () => {
    if (isMock) return;
    onMarkAllReady?.(
      order.id,
      items.map((i) => i.id),
    );
  };

  const serviceType = order.service_type;
  const svc = serviceType && serviceType !== 'dine_in' ? SERVICE_ICONS[serviceType] : null;

  // Ready count for inline indicator
  const readyCount = items.filter((i) => i.item_status === 'ready').length;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg overflow-hidden bg-app-card border border-app-border',
        URGENCY_CARD_STYLES[urgency],
        isMock && 'opacity-80',
      )}
    >
      {/* ━━━ COLORED HEADER (Square KDS style) ━━━ */}
      <div className={cn('px-3 py-2', cfg.headerBg, cfg.headerText)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black text-lg break-words">
              {order.table_number || order.order_number}
            </span>
            {svc && (
              <div className="flex items-center gap-1 opacity-80">
                <svc.icon className="w-3.5 h-3.5" />
                <span className="text-xs font-bold uppercase">{svc.label}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => printKitchenTicket(order)}
              className="w-8 h-8 min-h-[44px] flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              title="Imprimer"
            >
              <Printer className="w-4 h-4" />
            </button>
            <div
              className={cn(
                'flex items-center gap-1 font-mono text-sm font-bold',
                URGENCY_TIMER_STYLES[urgency],
              )}
            >
              {urgency === 'critical' ? (
                <Flame className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4 opacity-70" />
              )}
              {formatTime(elapsed)}
            </div>
          </div>
        </div>
        {/* Order number + server + customer (second line, compact) */}
        {(order.order_number || order.server || order.customer_name) && (
          <div className="flex items-center gap-2 mt-0.5 text-xs font-bold opacity-70">
            {order.order_number && order.table_number && (
              <span className="font-mono font-bold">#{order.order_number}</span>
            )}
            {order.customer_name && (
              <span className="truncate max-w-[120px]">{order.customer_name}</span>
            )}
            {order.server && <span>{order.server.full_name}</span>}
            {serviceType === 'room_service' && order.room_number && (
              <span>Ch. {order.room_number}</span>
            )}
          </div>
        )}
      </div>

      {/* ━━━ Customer Notes ━━━ */}
      {order.notes && (
        <div className="px-3 py-1.5 bg-amber-500/[0.08] border-b border-app-border">
          <div className="flex items-start gap-1.5 text-amber-300/80">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <p className="text-sm font-medium leading-snug">{order.notes}</p>
          </div>
        </div>
      )}

      {/* ━━━ ITEMS LIST (grouped by course) ━━━ */}
      <div className="flex-1 overflow-y-auto max-h-44 sm:max-h-64 md:max-h-80 lg:max-h-[360px] custom-scrollbar divide-y divide-app-border">
        {(() => {
          // Group items by course
          const grouped: Record<string, OrderItem[]> = {};
          for (const item of items) {
            const course = item.course || 'main';
            if (!grouped[course]) grouped[course] = [];
            grouped[course].push(item);
          }

          // Determine distinct courses present
          const presentCourses = COURSE_ORDER.filter((c) => grouped[c] && grouped[c].length > 0);
          // Add any courses not in COURSE_ORDER
          for (const course of Object.keys(grouped)) {
            if (!presentCourses.includes(course as Course)) {
              presentCourses.push(course as Course);
            }
          }

          const showHeaders = presentCourses.length >= 2;

          return presentCourses.map((course) => (
            <div key={course}>
              {showHeaders && (
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted">
                    {COURSE_LABELS[course] || 'AUTRES'}
                  </span>
                </div>
              )}
              {grouped[course]!.map((item) => {
                const badge = ITEM_BADGES[item.item_status || 'pending'] || ITEM_BADGES.pending;
                const hasNotes = item.notes || item.customer_notes;
                const hasMods = item.modifiers && item.modifiers.length > 0;

                return (
                  <div key={item.id} className="flex items-start gap-2 px-3 py-2">
                    {/* Number + Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base text-app-text-secondary font-black tabular-nums shrink-0">
                          {item.quantity}x
                        </span>
                        <span className="text-base font-semibold text-app-text leading-tight break-words">
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
                        <div className="flex flex-wrap gap-x-2 ml-5 mt-0.5">
                          {item.modifiers!.map((mod, modIdx) => (
                            <span key={modIdx} className="text-sm text-app-text-secondary">
                              + {mod.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {hasNotes && (
                        <p className="text-sm text-amber-400/60 ml-5 mt-0.5 italic">
                          {item.customer_notes || item.notes}
                        </p>
                      )}
                    </div>

                    {/* Status badge - tap to cycle */}
                    <button
                      onClick={() => handleItemClick(item)}
                      disabled={isMock}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded-md text-xs font-bold shrink-0 transition-all',
                        badge.bg,
                        badge.text,
                        !isMock && 'cursor-pointer active:scale-95',
                      )}
                    >
                      <div className={cn('w-1.5 h-1.5 rounded-full', badge.dot)} />
                    </button>
                  </div>
                );
              })}
            </div>
          ));
        })()}

        {items.length === 0 && (
          <div className="text-center py-6 text-app-text-secondary text-xs">{tc('noItems')}</div>
        )}
      </div>

      {/* ━━━ ACTION BAR ━━━ */}
      {cfg.actionLabel && (
        <div className="flex border-t border-app-border">
          {/* Mark all ready shortcut */}
          {order.status !== 'ready' && items.length > 0 && (
            <button
              onClick={handleMarkAllReady}
              disabled={isMock}
              className="flex items-center justify-center gap-1 px-3 min-h-[48px] text-xs font-bold uppercase tracking-wide text-app-text-secondary hover:text-app-text bg-app-hover/30 hover:bg-app-hover border-r border-app-border transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {readyCount > 0 && (
                <span className="tabular-nums">
                  {readyCount}/{items.length}
                </span>
              )}
            </button>
          )}

          {/* Main action button - big, colored, full-width */}
          <button
            onClick={handleAction}
            disabled={isMock}
            className={cn(
              'flex-1 min-h-[48px] font-black text-base uppercase tracking-wider text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2',
              cfg.actionBg,
            )}
          >
            {cfg.actionLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
