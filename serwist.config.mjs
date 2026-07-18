// @ts-check
// Serwist "Configurator mode" config. The service worker is built as a separate
// step AFTER `next build` (see package.json: `next build && serwist build`), so
// it does NOT depend on the bundler. This is why it works under Turbopack -
// unlike the old @ducanh2912/next-pwa Webpack plugin, which silently emitted no
// SW under Turbopack (see git history / next.config.mjs comment).
import { spawnSync } from 'node:child_process';
import { serwist } from '@serwist/next/config';

// A stable revision versions the precached fallback page so a new deploy
// invalidates the old cached copy instead of serving it forever (the exact
// failure mode that made shipped fixes "never reach production" before).
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  String(Date.now());

export default serwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Do NOT bulk-precache every prerendered route on install: over the slow /
  // metered networks this app targets (subsaharan Africa), downloading ~10 MB
  // up front on first load is hostile. Instead the pages a user actually visits
  // are runtime-cached (defaultCache in src/app/sw.ts), so a reload while
  // offline still serves them - without the heavy upfront cost.
  precachePrerendered: false,
  // Precache NOTHING from the build output either: globbing .next/static/** pulls
  // ~10 MB of JS chunks into the install, which is real money on metered mobile
  // data. Everything is runtime-cached as the user actually visits it (see
  // defaultCache in src/app/sw.ts), so a reload while offline still serves the
  // pages/assets already used - at a fraction of the data cost.
  globPatterns: [],
  // Precache only the tiny offline fallback document so a hard reload while
  // offline on a never-visited route still renders a real page.
  additionalPrecacheEntries: [{ url: '/offline', revision }],
});
