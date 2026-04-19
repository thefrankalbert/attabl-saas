'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Order, OrderItem, OrderStatus, ItemStatus, KDSZoneFilter } from '@/types/admin.types';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';

// ─── Urgency ─────────────────────────────────────────────────

type UrgencyLevel = 'fresh' | 'normal' | 'aging' | 'late' | 'critical';

function getUrgency(minutes: number): UrgencyLevel {
  if (minutes < 5) return 'fresh';
  if (minutes < 10) return 'normal';
  if (minutes < 15) return 'aging';
  if (minutes < 20) return 'late';
  return 'critical';
}

const URGENCY_BORDER: Record<UrgencyLevel, string> = {
  fresh: '',
  normal: '',
  aging: '',
  late: '',
  critical: '',
};

// ─── Status badge config ─────────────────────────────────────

const STATUS_BADGE: Record<string, { labelKey: string; className: string }> = {
  pending: {
    labelKey: 'statusQueue',
    className: 'text-app-text-muted border border-app-border',
  },
  preparing: {
    labelKey: 'statusCooking',
    className: 'bg-orange-500 text-white',
  },
  ready: {
    labelKey: 'statusPacking',
    className: 'bg-emerald-500 text-white',
  },
};

// ─── CTA config ──────────────────────────────────────────────

const CTA_CONFIG: Record<string, { labelKey: string; next: OrderStatus | undefined; bg: string }> =
  {
    pending: {
      labelKey: 'startCooking',
      next: 'preparing',
      bg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black',
    },
    preparing: {
      labelKey: 'finishCooking',
      next: 'ready',
      bg: 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white',
    },
    ready: {
      labelKey: 'done',
      next: 'delivered',
      bg: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white',
    },
  };

// ─── Props ───────────────────────────────────────────────────

interface KDSTicketProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  /** @deprecated Kept for KitchenBoard compat - no longer used in compact card */
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  /** @deprecated Kept for KitchenBoard compat - no longer used in compact card */
  onMarkAllReady?: (orderId: string, itemIds: string[]) => Promise<void>;
  onUpdate?: () => void;
  isMock?: boolean;
  zoneFilter?: KDSZoneFilter;
  barDisplayEnabled?: boolean;
}

// ─── Component ───────────────────────────────────────────────

export default function KDSTicket({
  order,
  onStatusChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated prop retained for API compatibility; will be removed once all callers stop passing it
  onUpdateItemStatus: _onUpdateItemStatus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated prop retained for API compatibility; will be removed once all callers stop passing it
  onMarkAllReady: _onMarkAllReady,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated prop retained for API compatibility; will be removed once all callers stop passing it
  onUpdate: _onUpdate,
  isMock = false,
  zoneFilter = 'all',
  barDisplayEnabled = false,
}: KDSTicketProps) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('kitchen');

  // Extract short order number: "CMD-20260403-001" -> "001"
  const shortOrderNumber = useMemo(() => {
    const num = order.order_number;
    if (!num) return order.table_number;
    const match = num.match(/-(\d+)$/);
    return match ? match[1] : num;
  }, [order.order_number, order.table_number]);

  // ─── Service type labels ─────────────────────────────────
  const SERVICE_LABELS: Record<string, string> = {
    dine_in: t('serviceDineIn'),
    takeaway: t('serviceTakeaway'),
    delivery: t('serviceDelivery'),
    room_service: t('serviceRoom'),
  };

  // Filter items based on zone selection
  const allItems: OrderItem[] =
    order.items || (order as { order_items?: OrderItem[] }).order_items || [];
  const items = allItems.filter((item) => {
    const zone = item.preparation_zone || 'kitchen';
    if (!barDisplayEnabled) {
      // Bar display OFF: show all items on the single KDS screen
      return true;
    }
    // Bar display ON: filter by selected zone
    if (zoneFilter === 'kitchen') return zone !== 'bar';
    if (zoneFilter === 'bar') return zone !== 'kitchen';
    return true; // 'all' shows everything
  });

  // ─── Timer (stops when order is ready/delivered) ───────────
  const isTimerActive = order.status === 'pending' || order.status === 'preparing';
  useEffect(() => {
    const calculate = () => {
      const diff = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000);
      setElapsed(diff);
    };
    calculate();
    if (!isTimerActive) return;
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [order.created_at, isTimerActive]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const minutes = Math.floor(elapsed / 60);
  const urgency = getUrgency(minutes);

  // ─── Due time (created_at + 20min as default target) ─────
  const dueTimeStr = useMemo(() => {
    const d = new Date(order.created_at);
    d.setMinutes(d.getMinutes() + 20);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }, [order.created_at]);

  // ─── Status badge ────────────────────────────────────────
  const badge = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
  const isDelayed = urgency === 'critical';

  // ─── CTA ─────────────────────────────────────────────────
  const cta = CTA_CONFIG[order.status];

  // ─── Service type ────────────────────────────────────────
  const serviceLabel = order.service_type ? SERVICE_LABELS[order.service_type] : null;

  // ─── Server name (from joined admin_users relation) ─────
  const serverName = (order as unknown as { server?: { full_name?: string } }).server?.full_name;

  // ─── Actions ─────────────────────────────────────────────
  const handleAction = () => {
    if (isMock) return;
    if (cta?.next) onStatusChange(order.id, cta.next);
  };

  const elapsedStr = formatTime(elapsed);

  return (
    <div
      className={cn(
        'flex flex-col h-full rounded-lg overflow-hidden bg-app-card border border-app-border shadow-sm',
        URGENCY_BORDER[urgency],
        isMock && 'opacity-80',
      )}
    >
      {/* ━━━ HEADER ━━━ */}
      <div className="px-3 pt-2.5 pb-2 border-b border-app-border">
        {/* Line 1: #order_number . table_number   Due HH:MM */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-semibold text-app-text">#{shortOrderNumber}</span>
            {order.order_number && order.table_number && (
              <>
                <span className="text-app-text-muted text-xs" aria-hidden="true">
                  -
                </span>
                <span className="text-xs font-semibold text-app-text truncate">
                  {order.table_number}
                </span>
              </>
            )}
          </div>
          <span className="text-xs text-app-text-muted shrink-0">
            {t('due')} {dueTimeStr}
          </span>
        </div>

        {/* Line 2: server . customer . service_type   [STATUS BADGE] */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0 text-xs text-app-text-muted truncate">
            {serverName && (
              <span className="font-medium text-app-text-secondary truncate max-w-24">
                {serverName}
              </span>
            )}
            {order.customer_name && (
              <>
                <span aria-hidden="true">-</span>
                <span className="truncate max-w-24">{order.customer_name}</span>
              </>
            )}
            {serviceLabel && (
              <>
                <span aria-hidden="true">-</span>
                <span>{serviceLabel}</span>
              </>
            )}
            {order.service_type === 'room_service' && order.room_number && (
              <span className="ml-0.5">Ch. {order.room_number}</span>
            )}
          </div>
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0',
              isDelayed ? 'bg-red-500 text-white' : badge.className,
            )}
          >
            {isDelayed ? t('footerDelayed').toUpperCase() : t(badge.labelKey)}
          </span>
        </div>
      </div>

      {/* ━━━ ORDER NOTES ━━━ */}
      {order.notes && (
        <div className="px-3 py-1.5 border-b border-app-border">
          <p className="text-xs italic text-amber-500">{order.notes}</p>
        </div>
      )}

      {/* ━━━ ITEMS LIST ━━━ */}
      <div
        className={cn(
          'flex-1 min-h-0 px-3 py-2 space-y-1',
          expanded ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden',
        )}
        onClick={() => !expanded && items.length > 4 && setExpanded(true)}
        role={!expanded && items.length > 4 ? 'button' : undefined}
      >
        {(expanded ? items : items.slice(0, 4)).map((item) => {
          const hasNotes = item.notes || item.customer_notes;
          const hasMods = item.modifiers && item.modifiers.length > 0;

          return (
            <div key={item.id}>
              <div className="flex items-start gap-1.5">
                <span className="text-sm font-bold text-app-text tabular-nums shrink-0">
                  {item.quantity}
                </span>
                <span className="text-sm text-app-text leading-tight">{item.name}</span>
              </div>
              {hasMods &&
                item.modifiers!.map((mod, modIdx) => (
                  <div key={modIdx} className="ml-5 flex items-start gap-1.5">
                    <span className="text-xs text-app-text-muted tabular-nums shrink-0">1</span>
                    <span className="text-xs text-app-text-muted">{mod.name}</span>
                  </div>
                ))}
              {hasNotes && (
                <p className="text-xs italic text-amber-500/70 ml-5 mt-0.5">
                  {item.customer_notes || item.notes}
                </p>
              )}
            </div>
          );
        })}

        {!expanded && items.length > 4 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded(true)}
            className="w-full text-center py-1 text-xs font-medium text-accent hover:underline h-auto"
          >
            +{items.length - 4} {t('moreItems')}
          </Button>
        )}
        {expanded && items.length > 4 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded(false)}
            className="w-full text-center py-1 text-xs font-medium text-app-text-muted hover:underline h-auto"
          >
            {t('showLess')}
          </Button>
        )}
      </div>

      {/* ━━━ ACTION BAR ━━━ */}
      {cta && (
        <div className="flex items-stretch border-t border-app-border">
          {/* CTA button */}
          <Button
            onClick={handleAction}
            disabled={isMock}
            className={cn(
              'flex-1 min-h-[44px] flex items-center justify-between px-3 font-bold text-sm uppercase tracking-wide active:scale-[0.98] rounded-none',
              isDelayed ? 'bg-red-500 hover:bg-red-400 active:bg-red-600 text-white' : cta.bg,
            )}
          >
            <span>{t(cta.labelKey)}</span>
            <span className="font-mono text-xs opacity-80">{elapsedStr}</span>
          </Button>

          {/* Print button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => printKitchenTicket(order, { zoneFilter, barDisplayEnabled })}
            className="w-11 min-h-[44px] border-l border-app-border bg-app-elevated hover:bg-app-hover rounded-none"
            title="Print"
          >
            <Printer className="w-4 h-4 text-app-text-muted" />
          </Button>
        </div>
      )}
    </div>
  );
}
