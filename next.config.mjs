import { withSentryConfig } from '@sentry/nextjs';
import withBundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';

const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// Service worker: real offline caching is now built by Serwist (Configurator
// mode, see serwist.config.mjs -> public/sw.js). This replaced @ducanh2912/next-pwa,
// a Webpack plugin that under Turbopack silently generated NO worker
// (attabl.com/sw.js returned 404), which stranded devices on an old SW serving
// stale JS so shipped fixes "never reached production". To keep that from
// recurring, /sw.js is served with `no-store` below so neither the browser nor
// the CDN can pin a stale worker: the update check always fetches the live one.

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// CFG-01. `hostname: '**.supabase.co'` autorisait /_next/image a proxifier
// N'IMPORTE QUEL projet Supabase du monde. Un tiers pouvait donc faire servir ses
// images par notre domaine, a nos frais d'optimisation, sous notre reputation.
//
// On epingle sur l'hote reel du projet. Si la variable est absente (build sans
// environnement: lint, typecheck, worktree de travail), on retombe sur le motif
// large: ces builds ne servent aucune image, et faire echouer le build a cet
// endroit casserait la CI sans rien proteger. Sur Vercel la variable est toujours
// definie, donc le trou est ferme la ou il compte.
const supabaseImageHostname = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return '**.supabase.co';
  try {
    return new URL(raw).hostname;
  } catch {
    return '**.supabase.co';
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseImageHostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const baseHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(self), microphone=(), geolocation=()',
      },
      {
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      },
      {
        key: 'Cross-Origin-Resource-Policy',
        value: 'same-origin',
      },
    ];
    // RFC 6797: HSTS must only be served over HTTPS. Sending it over HTTP (dev)
    // poisons the browser's HSTS cache and blocks local dev navigation.
    if (isProd) {
      baseHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }
    // Content-Security-Policy is now set dynamically in src/proxy.ts
    // with per-request nonces (replaces 'unsafe-inline' in script-src).
    // CORS: /api/* routes are same-origin (called from *.attabl.com subdomains).
    // Cross-Origin-Resource-Policy: same-origin (above) restricts cross-origin
    // embedding. No Access-Control-Allow-Origin header is needed because all
    // API calls are first-party. If third-party API access is added later,
    // add explicit CORS headers scoped to those routes only.
    return [
      {
        source: '/(.*)',
        headers: baseHeaders,
      },
      {
        // The Serwist worker must never be pinned by the browser HTTP cache or
        // the CDN: a stale /sw.js is exactly what stranded devices on old JS
        // before. `no-store` guarantees the SW update check fetches the live one.
        //
        // CFG-02: SOURCE UNIQUE. `vercel.json` definissait les memes en-tetes avec
        // une valeur DIFFERENTE (`no-cache, no-store, must-revalidate`) - deux
        // sources pour un en-tete, donc personne ne savait laquelle s'appliquait.
        // On garde celle-ci parce qu'elle vaut aussi en local (`pnpm start`), la ou
        // vercel.json ne s'applique pas: meme comportement partout.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          // Repris de vercel.json: autorise le worker a controler toute l'origine.
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  async redirects() {
    // Legacy per-industry landing routes are now anchored sections of /solutions.
    // 308 permanent redirects preserve any external links / search-engine entries.
    return [
      { source: '/restaurants', destination: '/solutions#ind-restaurant', permanent: true },
      { source: '/hotels', destination: '/solutions#ind-hotel', permanent: true },
      { source: '/quick-service', destination: '/solutions#ind-qsr', permanent: true },
      { source: '/fast-food', destination: '/solutions#ind-qsr', permanent: true },
      { source: '/bars-cafes', destination: '/solutions#ind-bar', permanent: true },
    ];
  },
  // Rewrites are handled by middleware.ts for better control
  // async rewrites() { ... }
};

export default withSentryConfig(analyze(withNextIntl(nextConfig)), {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'odc-digital-solub',
  project: 'attabl-saas',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-side errors will fail.
  tunnelRoute: '/monitoring',

  // CFG-02. Un bloc `webpack: { treeshake, reactComponentAnnotation }` vivait ici.
  // Il etait INERTE: ce projet builde avec Turbopack ("Next.js 16.2.12 (Turbopack)"
  // dans la sortie de build), et ces options sont propres a Webpack. Il donnait donc
  // une fausse assurance - on croyait les logs Sentry tree-shakes et les composants
  // annotes, rien de tout cela n'avait lieu. Supprime plutot que laisse en place:
  // une configuration morte finit toujours par etre lue comme active.
  // Si Sentry publie un equivalent Turbopack, c'est ici qu'il ira.
});
