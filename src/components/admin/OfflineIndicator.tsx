'use client';

import { WifiOff, RefreshCw, UploadCloud, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOrderOutbox } from '@/hooks/useOrderOutbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  // Mounted app-wide in the admin layout, so this also drains the durable order
  // outbox on reconnect / refocus while the operator is anywhere in admin.
  const { pending, rejected, dismissRejected } = useOrderOutbox();
  const tc = useTranslations('common');

  const showRejected = rejected.length > 0;
  const showPending = pending > 0;

  if (isOnline && !wasOffline && !showPending && !showRejected) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col">
      {(!isOnline || wasOffline) && (
        <div
          className={cn(
            'flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors duration-300',
            isOnline && wasOffline ? 'bg-accent text-accent-text' : 'bg-app-bg text-app-text',
          )}
        >
          {isOnline ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {tc('connectionRestored')}
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              {tc('offlineMode')}
            </>
          )}
        </div>
      )}

      {showPending && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/15 py-2 text-sm font-medium text-amber-500 ring-1 ring-amber-500/30">
          <UploadCloud className="h-4 w-4" />
          {tc('outboxPending', { count: pending })}
        </div>
      )}

      {showRejected && (
        <Button
          type="button"
          variant="ghost"
          onClick={dismissRejected}
          aria-label={tc('aria.close')}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-none bg-red-500/15 py-2 text-sm font-medium text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/25 hover:text-red-500"
        >
          <AlertTriangle className="h-4 w-4" />
          {tc('outboxRejected', { count: rejected.length })}
        </Button>
      )}
    </div>
  );
}
