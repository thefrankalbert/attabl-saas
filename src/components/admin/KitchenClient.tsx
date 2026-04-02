'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useKitchenData } from '@/hooks/useKitchenData';
import { usePermissions } from '@/hooks/usePermissions';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import KitchenFilters from '@/components/features/kitchen/KitchenFilters';
import KitchenBoard from '@/components/features/kitchen/KitchenBoard';
import FooterSummaryBar from '@/components/features/kitchen/FooterSummaryBar';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import type { OrderStatus } from '@/types/admin.types';

interface KitchenClientProps {
  tenantId: string;
  tenantName?: string;
  notificationSoundId?: string;
}

const CHEF_VIEW_ROLES = ['owner', 'admin', 'manager', 'chef'] as const;

export default function KitchenClient({
  tenantId,
  tenantName,
  notificationSoundId,
}: KitchenClientProps) {
  const t = useTranslations('kitchen');
  const { role } = usePermissions();

  const ts = useTranslations('shortcuts');
  const isChefView = (CHEF_VIEW_ROLES as readonly string[]).includes(role);
  const kitchen = useKitchenData({ tenantId, notificationSoundId });

  // -- Sound unlock interstitial (browser blocks audio until user gesture) --
  const [soundUnlocked, setSoundUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('kds-sound-unlocked') === 'true';
  });

  const handleUnlock = useCallback(() => {
    setSoundUnlocked(true);
    sessionStorage.setItem('kds-sound-unlocked', 'true');
  }, []);

  // -- Footer filter state --
  const [footerFilter, setFooterFilter] = useState<OrderStatus | 'all'>('all');

  // Flat sorted list of all orders for the board
  const boardOrders = useMemo(() => {
    if (footerFilter === 'all') return kitchen.allOrders;
    return kitchen.allOrders.filter((o) => o.status === footerFilter);
  }, [kitchen.allOrders, footerFilter]);

  const handlePageChange = useCallback((_direction: 'prev' | 'next') => {
    // Pagination placeholder - no-op until board pagination is implemented
  }, []);

  // -- Wake lock: prevent tablet screen from sleeping during KDS use --
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or denied - silently ignore
      }
    }

    requestWakeLock();

    // Re-request on visibility change (wake lock is released when tab is hidden)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      wakeLock?.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // -- Contextual keyboard shortcuts --
  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        id: 'kds-advance',
        label: ts('advanceTicket'),
        section: 'contextual',
        keys: ['n'],
        action: () => {
          const first = kitchen.pendingOrders[0];
          if (first) kitchen.handleStatusChange(first.id, 'preparing');
        },
      },
      {
        id: 'kds-all-ready',
        label: ts('markAllReady'),
        section: 'contextual',
        keys: ['r'],
        action: () => {
          const first = kitchen.preparingOrders[0];
          if (first) {
            const itemIds = (first.items || []).map((i: { id: string }) => i.id);
            if (itemIds.length > 0) kitchen.markAllItemsReady(first.id, itemIds);
          }
        },
      },
    ],
    [ts, kitchen],
  );
  useContextualShortcuts(shortcuts);

  const [viewMode, setViewMode] = useState<'active' | 'completed'>('active');
  const isFs = kitchen.isFullscreen;

  const safeAreaStyle = isFs
    ? {
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }
    : undefined;

  const containerClass = isFs ? 'fixed inset-0 z-[200]' : 'h-full';

  if (kitchen.loading) {
    return (
      <div
        className={`${containerClass} bg-app-bg flex items-center justify-center text-app-text`}
        style={safeAreaStyle}
      >
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm font-medium text-app-text-secondary">{t('loadingKds')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${containerClass} bg-app-bg text-app-text flex flex-col overflow-hidden`}
      style={safeAreaStyle}
    >
      {!soundUnlocked && (
        <div
          className="fixed inset-0 z-[250] bg-app-bg/95 flex items-center justify-center cursor-pointer"
          onClick={handleUnlock}
          onTouchStart={handleUnlock}
        >
          <div className="text-center p-8">
            <Volume2 className="w-16 h-16 text-amber-400 mx-auto" />
            <p className="text-lg font-bold text-app-text mt-4">{t('tapToEnableSound')}</p>
            <p className="text-sm text-app-text-muted mt-2">{t('tapToEnableSoundDesc')}</p>
          </div>
        </div>
      )}

      <KitchenFilters
        activeCount={kitchen.totalActive}
        completedToday={kitchen.completedToday}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isFullscreen={kitchen.isFullscreen}
        toggleFullscreen={kitchen.toggleFullscreen}
        goBack={kitchen.goBack}
        isChefView={isChefView}
      />

      <KitchenBoard
        orders={viewMode === 'completed' ? kitchen.completedOrders : boardOrders}
        showMockData={kitchen.showMockData}
        onStatusChange={kitchen.handleStatusChange}
        onUpdateItemStatus={kitchen.updateItemStatus}
        onMarkAllReady={kitchen.markAllItemsReady}
        onUpdate={kitchen.loadOrders}
        isChefView={isChefView}
      />

      <FooterSummaryBar
        orders={kitchen.allOrders}
        activeFilter={footerFilter}
        onFilterChange={setFooterFilter}
        currentPage={1}
        totalPages={1}
        onPageChange={handlePageChange}
        tenantName={tenantName}
      />
    </div>
  );
}
