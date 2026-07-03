'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpdateAvailableBannerProps {
  /** Deploy sha the current page was served with (from APP_VERSION, server-baked). */
  currentVersion: string;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Shows a dismissable "new version available" banner in the admin shell when a
 * newer deployment is detected, with a manual Refresh button (Claude-desktop
 * style). Polls /api/version on an interval and whenever the tab regains focus,
 * so a staff member who leaves the dashboard open picks up updates without a
 * service worker (the SW was removed - it served stale cache; see PR #201).
 */
export function UpdateAvailableBanner({ currentVersion }: UpdateAvailableBannerProps) {
  const t = useTranslations('updateBanner');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    // No deploy sha (local dev) -> nothing to compare against.
    if (!currentVersion || currentVersion === 'dev') return;
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      if (data.version && data.version !== currentVersion) {
        setUpdateAvailable(true);
      }
    } catch {
      // Network blip - ignore and retry on the next tick.
    }
  }, [currentVersion]);

  useEffect(() => {
    if (!currentVersion || currentVersion === 'dev') return;

    const interval = setInterval(check, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', check);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', check);
    };
  }, [check, currentVersion]);

  if (!updateAvailable) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-status-info" aria-hidden="true" />
        <span className="text-sm text-foreground">{t('message')}</span>
        <Button size="sm" onClick={() => window.location.reload()}>
          {t('refresh')}
        </Button>
      </div>
    </div>
  );
}
