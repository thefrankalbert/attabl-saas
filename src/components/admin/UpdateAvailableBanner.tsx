'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpdateAvailableBannerProps {
  /** Deploy sha the current page was served with (from APP_VERSION, server-baked). */
  currentVersion: string;
  /** When the sidebar is collapsed, render icon-only (label hidden, kept in tooltip). */
  collapsed?: boolean;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Shows a dismissable "new version available" banner in the admin shell when a
 * newer deployment is detected, with a manual Refresh button (Claude-desktop
 * style). Polls /api/version on an interval and whenever the tab regains focus,
 * so a staff member who leaves the dashboard open picks up updates without a
 * service worker (the SW was removed - it served stale cache; see PR #201).
 *
 * Rendered as a discreet row at the bottom of the sidebar, just under the
 * account block. Clicking the row reloads to the new deploy.
 */
export function UpdateAvailableBanner({
  currentVersion,
  collapsed = false,
}: UpdateAvailableBannerProps) {
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

  if (collapsed) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => window.location.reload()}
        title={t('message')}
        aria-label={t('message')}
        className="relative mx-auto mt-1 flex size-9 items-center justify-center rounded-lg border border-status-info/25 bg-status-info/10 text-status-info hover:bg-status-info/15 hover:text-status-info"
      >
        <ArrowUpCircle className="size-4" />
        <span className="absolute -right-0.5 -top-0.5 flex size-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-info opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-status-info" />
        </span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => window.location.reload()}
      title={t('message')}
      aria-label={t('message')}
      className="group mt-1 flex h-auto w-full items-center justify-start gap-2.5 rounded-lg border border-status-info/25 bg-status-info/10 px-2 py-2 text-left hover:bg-status-info/15"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-status-info/15 text-status-info">
        <ArrowUpCircle className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[var(--sidebar-foreground)]">
          {t('sidebarLabel')}
        </span>
        <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
          {t('refreshHint')}
        </span>
      </span>
      <RefreshCw className="size-3.5 shrink-0 text-status-info transition-transform duration-300 group-hover:rotate-180" />
    </Button>
  );
}
