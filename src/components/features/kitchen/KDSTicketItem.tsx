'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OrderItem, ItemStatus } from '@/types/admin.types';

interface KDSTicketItemProps {
  item: OrderItem;
  orderId: string;
  expanded: boolean;
  items: OrderItem[];
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
}

export default function KDSTicketItem({
  item,
  orderId,
  expanded,
  items,
  onUpdateItemStatus,
}: KDSTicketItemProps) {
  const hasNotes = item.notes || item.customer_notes;
  const hasMods = item.modifiers && item.modifiers.length > 0;
  const isItemReady = item.item_status === 'ready';
  // Per-item bump tap target (audit H12). Avoid nesting a button inside the
  // collapsed card's expand-on-tap container: only interactive when the card is
  // expanded or short enough that the container is not a button.
  const itemInteractive = !!onUpdateItemStatus && (expanded || items.length <= 4);

  const itemBody = (
    <>
      <div className="flex items-start gap-1.5">
        <span className="text-sm font-bold text-app-text tabular-nums shrink-0">
          {item.quantity}
        </span>
        <span
          className={cn(
            'text-sm text-app-text leading-tight',
            isItemReady && 'line-through text-app-text-muted',
          )}
        >
          {item.name}
        </span>
      </div>
      {hasMods &&
        item.modifiers!.map((mod, modIdx) => (
          <div key={modIdx} className="ml-5 flex items-start gap-1.5">
            <span className="text-xs text-app-text-muted tabular-nums shrink-0">1</span>
            <span className="text-xs text-app-text-muted">{mod.name}</span>
          </div>
        ))}
      {hasNotes && (
        <p className="text-xs italic text-[var(--warning)] ml-5 mt-0.5">
          {item.customer_notes || item.notes}
        </p>
      )}
    </>
  );

  if (!itemInteractive) {
    return <div className={cn(item.held && 'opacity-40')}>{itemBody}</div>;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={isItemReady}
      onClick={(e) => {
        e.stopPropagation();
        onUpdateItemStatus?.(orderId, item.id, isItemReady ? 'pending' : 'ready', items);
      }}
      className={cn(
        'flex h-auto w-full min-h-[44px] flex-col items-start gap-0 rounded-md px-1.5 py-1 text-left',
        isItemReady ? 'opacity-70' : 'hover:bg-app-elevated',
        item.held && 'opacity-40',
      )}
    >
      {itemBody}
    </Button>
  );
}
