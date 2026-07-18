'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

// Registers the Serwist service worker (public/sw.js) on every page load so the
// app shell is precached and survives a reload while offline. Production only:
// `serwist build` only emits public/sw.js in the production build, and running a
// SW under `next dev` (HMR) causes stale-asset headaches.
const SW_ENABLED = process.env.NODE_ENV === 'production';

export function RegisterSW() {
  useEffect(() => {
    if (!SW_ENABLED || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        if (!cancelled) {
          logger.warn('Service worker registration failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
