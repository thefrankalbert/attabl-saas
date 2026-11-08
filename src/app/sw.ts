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
import { getOrderOutbox, readOutboxIdentity } from '../lib/offline/outbox-idb';
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
// L'hote Supabase: presque toutes les lectures admin ne passent PAS par /api/,
// elles vont directement a PostgREST depuis le navigateur (useOrders,
// useKitchenData, useDashboardStats, useAssignments, usePosUnpaidOrders,
// useNotifications, useSettingsData... 18 hooks). Ce sont donc des requetes
// CROSS-ORIGIN, que la derniere regle de defaultCache capture en NetworkFirst et
// ecrit dans un cache nomme 'cross-origin'. Les corps contiennent customer_name,
// customer_phone, notes et totaux. La garde sameOrigin ci-dessous ne les voyait
// pas, et 'cross-origin' ne figurait pas dans RUNTIME_DOC_CACHES: ces donnees
// survivaient donc a la deconnexion sur une tablette partagee.
// On cible les CHEMINS de l'API Supabase plutot que son hote: le worker est
// compile a part et rien ne garantit qu'une variable NEXT_PUBLIC_* y soit inlinee.
// Un `process` indefini a l'execution ferait planter le service worker entier,
// donc toute la PWA. Ces trois prefixes sont ceux de PostgREST, de l'auth et du
// realtime; /storage/v1/ en est volontairement ABSENT, les photos de menu doivent
// rester cachees pour que la carte s'affiche hors ligne.
const SUPABASE_API_PREFIXES = ['/rest/v1/', '/auth/v1/', '/realtime/v1/'];

const noCacheAuthenticated: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, sameOrigin }) =>
      !sameOrigin && SUPABASE_API_PREFIXES.some((p) => url.pathname.startsWith(p)),
    handler: new NetworkOnly(),
  },
];

// Runtime caches that can hold authenticated documents/RSC - cleared on logout.
// Names verified against the BUILT worker (grep cacheName in public/sw.js):
// serwist's defaultCache stores RSC payloads under 'pages-rsc' and
// 'pages-rsc-prefetch' (not 'rsc'/'rsc-prefetch'). 'pages' is the legacy
// next-pwa name, kept for stranded devices.
// 'cross-origin' est ajoute pour les appareils deja en service: le nouveau SW ne
// l'alimente plus (regle NetworkOnly ci-dessus), mais l'ancien l'a peut-etre
// rempli de donnees clients. Le purger a la deconnexion les efface.
const RUNTIME_DOC_CACHES = [
  'others',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
  'next-data',
  'cross-origin',
];

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
/**
 * Ou ouvrir la page admin visee par une notification.
 *
 * LE CHEMIN NE PEUT PAS ETRE ECRIT EN DUR PAR L'ENVOYEUR. Selon l'origine ou le
 * personnel s'est connecte, la meme page admin n'a pas le meme chemin:
 *
 *   - sur `<slug>.attabl.com`, le proxy reecrit `/admin/orders` vers la route
 *     interne, donc le chemin court marche;
 *   - sur `attabl.com` (ou atterrit la connexion par defaut, voir
 *     `post-login-destination.ts`), `/admin/orders` N'EXISTE PAS -
 *     `src/app/admin/` ne contient que `platform/` et `tenants/`. Un clic
 *     ouvrait donc une 404.
 *
 * L'envoyeur transmet le chemin DANS l'espace admin (`/orders`) et le slug du
 * restaurant; le service worker, qui seul connait son origine, prefixe.
 */
function cheminAdmin(data: { url?: string; slug?: string }): string {
  const dansAdmin = data.url || '/';
  if (!data.slug) return dansAdmin;
  const premierLabel = self.location.hostname.toLowerCase().split('.')[0];
  // Sous-domaine du restaurant: le proxy fait la reecriture lui-meme.
  if (premierLabel === data.slug.toLowerCase()) return `/admin${dansAdmin}`;
  // Domaine principal: chemin interne complet. (Aucun domaine personnalise
  // n'est configure a ce jour; pour l'un d'eux cette route reste la vraie.)
  return `/sites/${data.slug}/admin${dansAdmin}`;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string; tag?: string; url?: string; slug?: string };
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
    data: { url: cheminAdmin(data) },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'ATTABL', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Deja prefixe a la reception du push (voir cheminAdmin).
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
    // Identite lue depuis IndexedDB: le worker n'a pas acces au module de page.
    // Sans elle, canReplayEntry refuserait toutes les entrees nominatives et ce
    // drain ne ferait rien, alors que c'est justement le chemin qui couvre
    // "onglet ferme pendant la coupure".
    const identity = await readOutboxIdentity();
    await outbox.drain(replayOrderEntry, {
      currentUserId: identity?.userId,
      currentTenantId: identity?.tenantId,
    });
  } catch {
    // Leave entries queued; the page-side interval/online drain is the fallback
    // for browsers without Background Sync (e.g. Safari/iOS).
  }
}
