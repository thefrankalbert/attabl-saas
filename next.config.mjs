import { withSentryConfig } from '@sentry/nextjs';
import withBundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';

const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// PWA/service worker removed: @ducanh2912/next-pwa is a Webpack plugin and the
// production build runs on Turbopack, so it silently generated NO service worker
// (attabl.com/sw.js returned 404). Devices that had registered an old SW from a
// past Webpack build kept serving stale cached JS and could never update, so
// shipped fixes "never reached production". A self-destructing /sw.js
// (src/app/sw.js/route.ts) now unregisters those orphaned workers. The app stays
// installable via manifest.json; real offline caching can be re-added later with
// a Turbopack-compatible tool (e.g. @serwist/next).

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
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

  // Webpack-specific options (not supported with Turbopack)
  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
    // Automatically instrument React components to track their render lifecycle
    reactComponentAnnotation: {
      enabled: true,
    },
  },
});
