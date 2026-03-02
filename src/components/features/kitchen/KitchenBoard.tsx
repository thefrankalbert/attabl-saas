'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import KDSTicket from '@/components/features/kitchen/KDSTicket';
import type { Order, OrderStatus, ItemStatus } from '@/types/admin.types';
import type { ColumnKey, ColumnConfig } from '@/hooks/useKitchenData';

interface KitchenBoardProps {
  columns: Record<ColumnKey, ColumnConfig>;
  columnOrders: Record<ColumnKey, Order[]>;
  activeTab: ColumnKey;
  showMockData: boolean;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  onUpdateItemStatus: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    allItems: { id: string; item_status?: string }[],
  ) => Promise<void>;
  onMarkAllReady: (orderId: string, itemIds: string[]) => Promise<void>;
  onUpdate: () => void;
  /** true = chef/admin full view, false = server/waiter simplified view (ready only) */
  isChefView: boolean;
}

function EmptyColumn({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-neutral-800/30 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-app-text-secondary" />
      </div>
      <p className="text-xs font-medium text-app-text-secondary">{label}</p>
    </div>
  );
}

export default function KitchenBoard({
  columns,
  columnOrders,
  activeTab,
  showMockData,
  onStatusChange,
  onUpdateItemStatus,
  onMarkAllReady,
  onUpdate,
  isChefView,
}: KitchenBoardProps) {
  // Server/waiter view: only show the "ready" column
  const visibleColumns: ColumnKey[] = isChefView
    ? (Object.keys(columns) as Array<ColumnKey>)
    : ['ready'];

  return (
    <div
      className={cn(
        'flex-1 grid overflow-hidden',
        isChefView ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1',
      )}
    >
      {visibleColumns.map((key, idx) => {
        const col = columns[key];
        const colOrders = columnOrders[key];
        const isActive = activeTab === key;

        return (
          <div
            key={key}
            className={cn(
              'flex-col overflow-hidden',
              col.colBg,
              isChefView && idx < 2 && 'md:border-r border-white/[0.04]',
              isChefView ? (isActive ? 'flex' : 'hidden md:flex') : 'flex',
            )}
          >
            {/* Column Header — hidden on mobile (tabs serve this role) */}
            <div
              className={cn(
                'py-1.5 px-2 sm:px-3 items-center gap-2 border-b border-white/[0.04] shrink-0 bg-neutral-900/20',
                isChefView ? 'hidden md:flex' : 'flex',
              )}
            >
              <div className={cn('w-2 h-2 rounded-full', col.dot)} />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-app-text-secondary">
                {col.label}
              </span>
              <span
                className={cn(
                  'ml-auto px-1.5 py-0.5 rounded text-xs font-black tabular-nums',
                  col.countBadge,
                )}
              >
                {colOrders.length}
              </span>
            </div>

            {/* Column Content */}
            <div
              className={cn(
                'flex-1 overflow-y-auto p-1.5 sm:p-2 custom-scrollbar',
                !isChefView
                  ? 'max-w-3xl mx-auto w-full space-y-2 sm:space-y-3'
                  : 'space-y-1.5 sm:space-y-2',
              )}
            >
              {colOrders.length > 0 ? (
                colOrders.map((o) => (
                  <KDSTicket
                    key={o.id}
                    order={o}
                    onStatusChange={onStatusChange}
                    onUpdateItemStatus={onUpdateItemStatus}
                    onMarkAllReady={onMarkAllReady}
                    onUpdate={onUpdate}
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
  );
}
