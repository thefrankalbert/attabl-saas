'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => window.location.reload()}
      title={t('message')}
      aria-label={t('message')}
      className={cn(
        'mt-1 flex h-9 w-full items-center gap-2 rounded-[0.625rem] text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]',
        collapsed ? 'justify-center px-0' : 'justify-start px-2',
      )}
    >
      <RefreshCw className="size-3.5 shrink-0 text-status-info" aria-hidden="true" />
      {!collapsed && <span className="truncate text-[13px] font-medium">{t('sidebarLabel')}</span>}
    </Button>
  );
}
