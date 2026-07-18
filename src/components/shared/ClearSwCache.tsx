'use client';

import { useEffect } from 'react';

/**
 * Tells the service worker to drop cached authenticated documents/RSC. Rendered
 * on the login page, which is the convergence point of every logged-out state
 * (manual logout, session expiry, redirect) - so a shared restaurant tablet does
 * not retain the previous user's admin pages after they sign out. Structured
 * /api data is never cached (NetworkOnly in the SW); this clears the doc caches
 * that make admin reloadable offline.
 */
export function ClearSwCache() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: 'attabl-clear-cache' });
  }, []);
  return null;
}
