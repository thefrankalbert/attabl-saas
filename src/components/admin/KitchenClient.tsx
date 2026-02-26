'use client';

import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useKitchenData } from '@/hooks/useKitchenData';
import { usePermissions } from '@/hooks/usePermissions';
import { useContextualShortcuts } from '@/hooks/useContextualShortcuts';
import KitchenFilters from '@/components/features/kitchen/KitchenFilters';
import KitchenBoard from '@/components/features/kitchen/KitchenBoard';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

interface KitchenClientProps {
  tenantId: string;
  notificationSoundId?: string;
}

const CHEF_VIEW_ROLES = ['owner', 'admin', 'manager', 'chef'] as const;

export default function KitchenClient({ tenantId, notificationSoundId }: KitchenClientProps) {
  const t = useTranslations('kitchen');
  const { role } = usePermissions();

  const ts = useTranslations('shortcuts');
  const isChefView = (CHEF_VIEW_ROLES as readonly string[]).includes(role);
  const kitchen = useKitchenData({ tenantId, notificationSoundId });

  // ── Contextual keyboard shortcuts ──
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
        className={`${containerClass} bg-neutral-950 flex items-center justify-center text-white`}
        style={safeAreaStyle}
      >
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm font-medium text-neutral-500">{t('loadingKds')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${containerClass} bg-neutral-950 text-white flex flex-col overflow-hidden`}
      style={safeAreaStyle}
    >
      <KitchenFilters
        pendingOrders={kitchen.pendingOrders}
        preparingOrders={kitchen.preparingOrders}
        readyOrders={kitchen.readyOrders}
        columns={kitchen.columns}
        columnOrders={kitchen.columnOrders}
        activeTab={kitchen.activeTab}
        setActiveTab={kitchen.setActiveTab}
        lastUpdate={kitchen.lastUpdate}
        showMockData={kitchen.showMockData}
        setShowMockData={kitchen.setShowMockData}
        soundEnabled={kitchen.soundEnabled}
        toggleSound={kitchen.toggleSound}
        isFullscreen={kitchen.isFullscreen}
        toggleFullscreen={kitchen.toggleFullscreen}
        goBack={kitchen.goBack}
        audioRef={kitchen.audioRef}
        isChefView={isChefView}
      />

      <KitchenBoard
        columns={kitchen.columns}
        columnOrders={kitchen.columnOrders}
        activeTab={kitchen.activeTab}
        showMockData={kitchen.showMockData}
        onStatusChange={kitchen.handleStatusChange}
        onUpdateItemStatus={kitchen.updateItemStatus}
        onMarkAllReady={kitchen.markAllItemsReady}
        onUpdate={kitchen.loadOrders}
        isChefView={isChefView}
      />
    </div>
  );
}
