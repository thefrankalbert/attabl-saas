'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors duration-300',
        isOnline && wasOffline ? 'bg-accent text-accent-text' : 'bg-app-bg text-app-text',
      )}
    >
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Connexion retablie
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          Mode hors ligne
        </>
      )}
    </div>
  );
}
