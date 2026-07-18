/// <reference lib="webworker" />
//
// Service worker source (compiled by `serwist build` into public/sw.js).
//
// It does four jobs:
//  1. Precache the app shell + prerendered routes (Serwist __SW_MANIFEST) so a
//     reload while offline renders the app instead of a blank page.
//  2. Runtime-cache visited pages/assets (defaultCache) and fall back to the
//     /offline document when a navigation cannot be served.
//  3. Handle Web Push (migrated from the old push-only public/sw.js, which was
//     replaced by a self-destructing kill-switch when next-pwa was removed).
//  4. Background Sync: drain the durable order outbox when the network returns,
//     even if the tab was closed during the outage.
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from 'serwist';
import { Serwist, NetworkOnly } from 'serwist';
import { getOrderOutbox } from '../lib/offline/outbox-idb';
import { replayOrderEntry, OUTBOX_SYNC_TAG } from '../lib/offline/outbox-replay';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Never runtime-cache the STRUCTURED tenant data: /api/* responses (orders,
// payments, customers) stay NetworkOnly so they are never written to a device
// cache. Offline READS for the admin come from the app's own TanStack IndexedDB
// persist (scoped + invalidatable), so this is non-lossy.
//
// Admin DOCUMENTS (the app shell / RSC) are deliberately NOT NetworkOnly: they
// must be runtime-cached (defaultCache) so a reload while offline serves the
// dashboard/POS instead of the /offline page - that is the whole point of the
// feature for staff tablets. The shared-tablet retention concern is handled by
// clearing these caches on logout (message handler below), not by refusing to
// cache (which broke offline admin entirely).
const noCacheAuthenticated: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
];

// Runtime caches that can hold authenticated documents/RSC - cleared on logout.
const RUNTIME_DOC_CACHES = ['others', 'pages', 'next-data', 'rsc-prefetch', 'rsc'];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...noCacheAuthenticated, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// --- Web Push ---------------------------------------------------------------
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string; tag?: string; url?: string };
  try {
    data = event.data.json();
  } catch {
    // Non-JSON payload: still show a generic notification so the UA does not
    // penalize the SW for a "push received without a user-visible notification".
    data = {};
  }
  const options: NotificationOptions = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'ATTABL', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Exact pathname match, not substring: with the default '/' (or any
      // prefix-overlapping path) includes() would focus an arbitrary tab
      // instead of opening the notification's actual target.
      for (const client of clients) {
        if (new URL(client.url).pathname === url && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

// --- Legacy cache cleanup ----------------------------------------------------
// Devices stranded on the old @ducanh2912/next-pwa worker may still hold its
// caches. The old kill-switch route wiped them; now that it is gone, purge the
// legacy-only names here: old workbox precaches, plus 'apis' and 'pages' which
// the new SW never writes (api/admin are NetworkOnly) but which may retain
// AUTHENTICATED responses cached by the next-pwa era on a shared tablet.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('workbox-precache') || k === 'apis' || k === 'pages')
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});

// --- Clear cached authenticated documents on logout -------------------------
// The client posts { type: 'attabl-clear-cache' } when the user logs out, so a
// shared restaurant tablet does not retain the previous user's admin pages/RSC
// in the runtime caches. /api data is never cached (NetworkOnly above), and the
// app's TanStack persist is cleared by the logout flow itself.
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'attabl-clear-cache') {
    event.waitUntil(Promise.all(RUNTIME_DOC_CACHES.map((c) => caches.delete(c))));
  }
});

// --- Background Sync: drain the durable order outbox on reconnect ------------
// The page registers the 'attabl-outbox' sync tag when it queues an order
// offline (see src/lib/offline/submit-order.ts). The browser fires this event
// once connectivity is back, even if no tab is open. Reuses the exact same
// idempotent replay the page uses, so a synced order never duplicates.
self.addEventListener('sync', (event) => {
  const syncEvent = event as ExtendableEvent & { tag: string };
  if (syncEvent.tag === OUTBOX_SYNC_TAG) {
    syncEvent.waitUntil(drainOutbox());
  }
});

async function drainOutbox(): Promise<void> {
  const outbox = getOrderOutbox();
  if (!outbox) return;
  try {
    await outbox.drain(replayOrderEntry);
  } catch {
    // Leave entries queued; the page-side interval/online drain is the fallback
    // for browsers without Background Sync (e.g. Safari/iOS).
  }
}
