'use client';

import { WifiOff, RefreshCw, UploadCloud, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOrderOutbox } from '@/hooks/useOrderOutbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Convive-facing network/outbox banner.
 *
 * Mounted app-wide in the storefront shell, so it drains the durable order
 * outbox on reconnect / refocus while the customer is anywhere in the menu or
 * cart - the client cart queues orders offline via submitOrder, and this is what
 * syncs them. Light-theme convive styling (the storefront forces light theme),
 * distinct from the admin OfflineIndicator's dark tokens.
 *
 * Rendered as an in-flow, non-growing flex child (NOT fixed): it sits above
 * <main#main-content> and pushes it down when visible, so it never overlaps the
 * cart's sticky header and never touches the h-dvh viewport chain. Renders
 * nothing in the normal (online, nothing pending) case.
 */
export function StorefrontOfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const { pending, rejected, dismissRejected } = useOrderOutbox();
  const t = useTranslations('tenant');

  const showRejected = rejected.length > 0;
  const showPending = pending > 0;

  if (isOnline && !wasOffline && !showPending && !showRejected) return null;

  return (
    <div className="shrink-0 flex flex-col">
      {(!isOnline || wasOffline) && (
        <div
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-semibold transition-colors duration-300',
            isOnline && wasOffline ? 'bg-[#16A34A] text-white' : 'bg-[#1A1A1A] text-white',
          )}
        >
          {isOnline ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('connectionRestored')}
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('offlineNotice')}</span>
            </>
          )}
        </div>
      )}

      {showPending && (
        <div className="flex items-center justify-center gap-2 bg-[#FEF3C7] py-2 text-[13px] font-semibold text-[#B45309]">
          <UploadCloud className="h-4 w-4 shrink-0" />
          {t('orderQueued', { count: pending })}
        </div>
      )}

      {showRejected && (
        <Button
          type="button"
          variant="ghost"
          onClick={dismissRejected}
          aria-label={t('close')}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-none bg-[#FEF2F2] py-2 text-[13px] font-semibold text-[#FF3008] hover:bg-[#FDE2DE] hover:text-[#FF3008]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t('orderQueuedFailed', { count: rejected.length })}
        </Button>
      )}
    </div>
  );
}
