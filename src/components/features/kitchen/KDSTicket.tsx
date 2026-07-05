'use client';

import { cn } from '@/lib/utils';
import type { Order, OrderStatus, ItemStatus, KDSZoneFilter } from '@/types/admin.types';
import { URGENCY_BORDER } from './kds-ticket.config';
import { useKDSTicket } from './useKDSTicket';
import KDSTicketHeader from './KDSTicketHeader';
import KDSTicketItemsList from './KDSTicketItemsList';
import KDSTicketActionBar from './KDSTicketActionBar';

// --- Props ---------------------------------------------------

interface KDSTicketProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  /** Per-item bump: tap an item to toggle pending <-> ready (audit H12). */
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  /** @deprecated Kept for KitchenBoard compat - no longer used in compact card */
  onMarkAllReady?: (orderId: string, itemIds: string[]) => Promise<void>;
  /** Fire/hold a whole course (KDS coursing). */
  onSetCourseHeld?: (orderId: string, course: string, held: boolean) => Promise<void>;
  onUpdate?: () => void;
  isMock?: boolean;
  zoneFilter?: KDSZoneFilter;
  barDisplayEnabled?: boolean;
}

// --- Component -----------------------------------------------

export default function KDSTicket({
  order,
  onStatusChange,
  onUpdateItemStatus,
  onSetCourseHeld,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated prop retained for API compatibility; will be removed once all callers stop passing it
  onMarkAllReady: _onMarkAllReady,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated prop retained for API compatibility; will be removed once all callers stop passing it
  onUpdate: _onUpdate,
  isMock = false,
  zoneFilter = 'all',
  barDisplayEnabled = false,
}: KDSTicketProps) {
  const {
    expanded,
    setExpanded,
    shortOrderNumber,
    items,
    urgency,
    dueTimeStr,
    badge,
    isDelayed,
    cta,
    serviceLabel,
    serverName,
    handleAction,
    elapsedStr,
    hasCourses,
  } = useKDSTicket({ order, onStatusChange, isMock, zoneFilter, barDisplayEnabled });

  return (
    <div
      className={cn(
        'flex flex-col h-full rounded-lg overflow-hidden bg-app-card border border-app-border shadow-sm',
        URGENCY_BORDER[urgency],
        isMock && 'opacity-80',
      )}
    >
      {/* --- HEADER --- */}
      <KDSTicketHeader
        order={order}
        shortOrderNumber={shortOrderNumber}
        dueTimeStr={dueTimeStr}
        serverName={serverName}
        serviceLabel={serviceLabel}
        isDelayed={isDelayed}
        badge={badge}
      />

      {/* --- ORDER NOTES --- */}
      {order.notes && (
        <div className="px-3 py-1.5 border-b border-app-border">
          <p className="text-xs italic text-[var(--warning)]">{order.notes}</p>
        </div>
      )}

      {/* --- ITEMS LIST --- */}
      <KDSTicketItemsList
        orderId={order.id}
        items={items}
        expanded={expanded}
        setExpanded={setExpanded}
        hasCourses={hasCourses}
        isMock={isMock}
        onUpdateItemStatus={onUpdateItemStatus}
        onSetCourseHeld={onSetCourseHeld}
      />

      {/* --- ACTION BAR --- */}
      {cta && (
        <KDSTicketActionBar
          order={order}
          cta={cta}
          isMock={isMock}
          isDelayed={isDelayed}
          handleAction={handleAction}
          elapsedStr={elapsedStr}
          zoneFilter={zoneFilter}
          barDisplayEnabled={barDisplayEnabled}
        />
      )}
    </div>
  );
}
