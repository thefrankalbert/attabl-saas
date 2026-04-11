'use client';

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import KDSTicket from '@/components/features/kitchen/KDSTicket';
import type { Order, OrderStatus, ItemStatus, KDSZoneFilter } from '@/types/admin.types';

interface KitchenBoardProps {
  orders: Order[];
  showMockData: boolean;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  onUpdateItemStatus?: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  onMarkAllReady?: (orderId: string, itemIds: string[]) => Promise<void>;
  onUpdate?: () => void;
  /** true = chef/admin full view, false = server/waiter simplified view (ready only) */
  isChefView: boolean;
  zoneFilter?: KDSZoneFilter;
  barDisplayEnabled?: boolean;
}

function EmptyState() {
  const t = useTranslations('kitchen');
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center col-span-full">
      <div className="w-14 h-14 rounded-xl bg-app-elevated/30 flex items-center justify-center mb-4">
        <ClipboardList className="w-7 h-7 text-app-text-secondary" />
      </div>
      <p className="text-sm font-medium text-app-text-secondary">{t('emptyActive')}</p>
    </div>
  );
}

export default function KitchenBoard({
  orders,
  showMockData,
  onStatusChange,
  onUpdateItemStatus,
  onMarkAllReady,
  onUpdate,
  isChefView,
  zoneFilter = 'all',
  barDisplayEnabled = false,
}: KitchenBoardProps) {
  // Filter out orders that have no visible items for the current zone
  const visibleOrders = orders.filter((order) => {
    if (!barDisplayEnabled) return true;
    const relevantItems = (order.items || []).filter((item) => {
      const zone = item.preparation_zone || 'kitchen';
      if (zoneFilter === 'kitchen') return zone !== 'bar';
      if (zoneFilter === 'bar') return zone !== 'kitchen';
      return true;
    });
    return relevantItems.length > 0;
  });

  // Server/waiter view: only show ready orders
  const displayOrders = isChefView
    ? visibleOrders
    : visibleOrders.filter((o) => o.status === 'ready');

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
      {displayOrders.length > 0 ? (
        <div
          className={cn(
            'grid gap-3',
            isChefView
              ? 'grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 @xl:grid-cols-5'
              : 'grid-cols-1 max-w-3xl mx-auto',
          )}
        >
          {displayOrders.map((o) => (
            <div key={o.id} className="min-h-[320px]">
              <KDSTicket
                order={o}
                onStatusChange={onStatusChange}
                onUpdateItemStatus={onUpdateItemStatus}
                onMarkAllReady={onMarkAllReady}
                onUpdate={onUpdate}
                isMock={showMockData}
                zoneFilter={zoneFilter}
                barDisplayEnabled={barDisplayEnabled}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
