// Sentry in the browser.
//
// This file MUST be named instrumentation-client.ts. It used to be
// sentry.client.config.ts, which only the Webpack plugin injects: this project
// builds with Turbopack, so that file was never loaded and Sentry never ran in
// the browser in production (no DSN in the client bundle, measured 2026-11-20).
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn,
  enabled: !!dsn,
  // production / preview on Vercel, local otherwise: errors from a laptop no
  // longer land in the production view.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'local',

  // Performance Monitoring
  // Capture 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // No Session Replay, on purpose (2026-11-20): it added 91 KB (275 KB unpacked)
  // of JavaScript to EVERY page, the heaviest file on a phone over 3G, and it
  // records what customers see on screen (names, phone numbers), a processing
  // of personal data that would have to be declared. Errors are still reported.

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out non-essential breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'console') {
      if (breadcrumb.level !== 'warning' && breadcrumb.level !== 'error') {
        return null;
      }
    }
    return breadcrumb;
  },

  // Strip sensitive data from client events
  beforeSend(event) {
    if (event.request?.data) {
      event.request.data = '[Filtered]';
    }
    return event;
  },
});

// Traces client-side navigations (required by @sentry/nextjs with the App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
