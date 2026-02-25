'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import KDSTicket from '@/components/features/kitchen/KDSTicket';
import type { Order, OrderStatus } from '@/types/admin.types';
import type { ColumnKey, ColumnConfig } from '@/hooks/useKitchenData';

interface KitchenBoardProps {
  columns: Record<ColumnKey, ColumnConfig>;
  columnOrders: Record<ColumnKey, Order[]>;
  activeTab: ColumnKey;
  showMockData: boolean;
  onStatusChange: (orderId: string, newStatus: OrderStatus) => Promise<void>;
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
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-neutral-800/40 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-neutral-700" />
      </div>
      <p className="text-sm font-semibold text-neutral-600">{label}</p>
    </div>
  );
}

export default function KitchenBoard({
  columns,
  columnOrders,
  activeTab,
  showMockData,
  onStatusChange,
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
              // Chef view mobile: only show active tab; Desktop: always show all
              // Server view: always show (single column)
              isChefView ? (isActive ? 'flex' : 'hidden md:flex') : 'flex',
            )}
          >
            {/* Column Header — hidden on mobile (tabs serve this role) */}
            <div
              className={cn(
                'py-2 px-2 sm:px-3 items-center gap-2 border-b border-white/[0.04] shrink-0 bg-neutral-900/30',
                isChefView ? 'hidden md:flex' : 'flex',
              )}
            >
              <div className={cn('w-2 h-2 rounded-full', col.dot)} />
              <span className="text-xs xl:text-sm font-bold uppercase tracking-[0.15em] text-neutral-500">
                {col.label}
              </span>
              <span
                className={cn(
                  'ml-auto px-2 py-0.5 rounded-md text-xs xl:text-sm font-black tabular-nums',
                  col.countBadge,
                )}
              >
                {colOrders.length}
              </span>
            </div>

            {/* Column Content */}
            <div
              className={cn(
                'flex-1 overflow-y-auto p-2 sm:p-2.5 custom-scrollbar',
                !isChefView
                  ? 'max-w-3xl mx-auto w-full space-y-3 sm:space-y-4'
                  : 'space-y-2 sm:space-y-2.5',
              )}
            >
              {colOrders.length > 0 ? (
                colOrders.map((o) => (
                  <KDSTicket
                    key={o.id}
                    order={o}
                    onStatusChange={onStatusChange}
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
