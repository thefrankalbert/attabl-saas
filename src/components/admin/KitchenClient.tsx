'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useKitchenData } from '@/hooks/useKitchenData';
import KitchenFilters from '@/components/features/kitchen/KitchenFilters';
import KitchenBoard from '@/components/features/kitchen/KitchenBoard';

interface KitchenClientProps {
  tenantId: string;
  notificationSoundId?: string;
}

export default function KitchenClient({ tenantId, notificationSoundId }: KitchenClientProps) {
  const t = useTranslations('kitchen');

  const kitchen = useKitchenData({ tenantId, notificationSoundId });

  if (kitchen.loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-neutral-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm font-medium text-neutral-500">{t('loadingKds')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-neutral-950 text-white flex flex-col overflow-hidden">
      <KitchenFilters
        pendingOrders={kitchen.pendingOrders}
        preparingOrders={kitchen.preparingOrders}
        readyOrders={kitchen.readyOrders}
        totalActive={kitchen.totalActive}
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
      />

      <KitchenBoard
        columns={kitchen.columns}
        columnOrders={kitchen.columnOrders}
        activeTab={kitchen.activeTab}
        showMockData={kitchen.showMockData}
        onStatusChange={kitchen.handleStatusChange}
        onUpdate={kitchen.loadOrders}
      />
    </div>
  );
}
