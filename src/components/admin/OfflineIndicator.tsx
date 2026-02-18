'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const t = useTranslations('common');

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors duration-300',
        isOnline && wasOffline ? 'bg-[#CCFF00] text-black' : 'bg-neutral-900 text-white',
      )}
    >
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t('connectionRestored')}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          {t('offlineMode')}
        </>
      )}
    </div>
  );
}
