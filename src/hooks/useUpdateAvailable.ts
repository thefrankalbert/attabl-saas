'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

/**
 * Detects when a newer deploy is live than the one this bundle was built from.
 *
 * The page bakes its deploy sha into `currentVersion` (APP_VERSION, server-side)
 * while /api/version reports the deploy currently serving requests. When they
 * diverge, a newer version has shipped and the open tab is stale. Polled on an
 * interval and whenever the tab regains focus, so a long-open tab (there is no
 * service worker to auto-update it) still learns it is out of date.
 *
 * Returns true once an update is available. Consumers surface a reload prompt.
 */
export function useUpdateAvailable(currentVersion: string | undefined): boolean {
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

  return updateAvailable;
}
