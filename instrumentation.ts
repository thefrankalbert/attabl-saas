// This file is used by Next.js to initialize instrumentation.
// It runs when the Next.js server starts up.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Load server-side Sentry configuration
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Load edge Sentry configuration (for middleware)
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
