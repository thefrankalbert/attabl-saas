'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Order, OrderStatus } from '@/types/admin.types';

interface FooterSummaryBarProps {
  orders: Order[];
  activeFilter: OrderStatus | 'all';
  onFilterChange: (filter: OrderStatus | 'all') => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (direction: 'prev' | 'next') => void;
  tenantName?: string;
}

interface StatusSummary {
  total: number;
  pending: number;
  preparing: number;
  ready: number;
  delayed: number;
}

function computeSummary(orders: Order[]): StatusSummary {
  const now = Date.now();
  let pending = 0;
  let preparing = 0;
  let ready = 0;
  let delayed = 0;

  for (const order of orders) {
    const minutes = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
    if (minutes >= 20) delayed++;

    if (order.status === 'pending') pending++;
    else if (order.status === 'preparing') preparing++;
    else if (order.status === 'ready') ready++;
  }

  return { total: orders.length, pending, preparing, ready, delayed };
}

interface TabConfig {
  key: OrderStatus | 'all' | 'delayed';
  label: string;
  count: number;
  baseColor: string;
  activeColor: string;
}

function FooterSummaryBarInner({
  orders,
  activeFilter,
  onFilterChange,
  currentPage,
  totalPages,
  onPageChange,
  tenantName,
}: FooterSummaryBarProps) {
  const t = useTranslations('kitchen');

  const summary = useMemo(() => computeSummary(orders), [orders]);

  const tabs: TabConfig[] = useMemo(
    () => [
      {
        key: 'all' as const,
        label: t('footerAll'),
        count: summary.total,
        baseColor: 'text-app-text',
        activeColor: 'bg-accent text-accent-text',
      },
      {
        key: 'pending' as const,
        label: t('footerQueue'),
        count: summary.pending,
        baseColor: 'text-amber-400',
        activeColor: 'bg-amber-500 text-black',
      },
      {
        key: 'preparing' as const,
        label: t('footerCooking'),
        count: summary.preparing,
        baseColor: 'text-blue-400',
        activeColor: 'bg-blue-500 text-white',
      },
      {
        key: 'ready' as const,
        label: t('footerPacking'),
        count: summary.ready,
        baseColor: 'text-emerald-400',
        activeColor: 'bg-emerald-500 text-white',
      },
      {
        key: 'delayed' as const,
        label: t('footerDelayed'),
        count: summary.delayed,
        baseColor: 'text-red-400',
        activeColor: 'bg-red-500 text-white',
      },
    ],
    [t, summary],
  );

  return (
    <footer className="h-10 shrink-0 z-[210] bg-app-card border-t border-app-border flex items-center px-3 gap-4">
      {/* Left: tenant name */}
      {tenantName && (
        <span className="text-[10px] font-medium text-app-text-secondary truncate max-w-[120px] hidden sm:block">
          {tenantName}
        </span>
      )}

      {/* Center: status filter tabs */}
      <nav role="tablist" className="flex items-center gap-1 flex-1 justify-center">
        {tabs.map((tab) => {
          const isActive = tab.key === 'delayed' ? false : activeFilter === tab.key;
          const isDelayedTab = tab.key === 'delayed';

          // Hide delayed tab when count is 0
          if (isDelayedTab && tab.count === 0) return null;

          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                // Delayed is display-only, not a filter
                if (!isDelayedTab) {
                  onFilterChange(tab.key as OrderStatus | 'all');
                }
              }}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                isActive ? tab.activeColor : tab.baseColor,
                !isActive && !isDelayedTab && 'hover:bg-app-elevated/50',
                isDelayedTab && 'cursor-default animate-pulse',
              )}
            >
              {tab.label}
              <span className="ml-1 tabular-nums">{tab.count}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: pagination */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onPageChange('prev')}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="p-0.5 rounded text-app-text-secondary hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-medium text-app-text-secondary tabular-nums whitespace-nowrap">
          {t('footerPage')} {currentPage}/{totalPages}
        </span>
        <button
          onClick={() => onPageChange('next')}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="p-0.5 rounded text-app-text-secondary hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
}

const FooterSummaryBar = React.memo(FooterSummaryBarInner);
FooterSummaryBar.displayName = 'FooterSummaryBar';

export default FooterSummaryBar;
