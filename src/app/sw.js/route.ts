// Self-destructing service worker served at /sw.js.
//
// Background: the app used @ducanh2912/next-pwa (a Webpack plugin) to generate a
// Workbox service worker. The production build now runs on Turbopack, so no SW is
// generated and /sw.js would 404. Devices that registered the OLD SW from a past
// Webpack build kept serving stale cached assets forever - and since /sw.js 404'd,
// the browser's update check never replaced it. Shipped fixes never appeared.
//
// This route makes /sw.js return a real (200) worker again, but one whose only job
// is to unregister itself and wipe every cache. When an orphaned worker does its
// periodic update check it fetches this script, installs it, and self-destructs -
// after which the device serves fresh network content and registers no SW.
// Fresh visitors never register a worker (next-pwa is gone), so this only ever runs
// on already-broken devices.

const KILL_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try {
      await self.registration.unregister();
    } catch (e) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    } catch (e) {}
  })());
});
`;

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(KILL_SW, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      // Never let a CDN or the browser cache the killer itself, so a stuck device
      // always fetches the live version on its next update check.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
