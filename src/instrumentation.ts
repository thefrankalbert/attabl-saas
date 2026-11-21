// Server start-up hook (Next.js instrumentation).
//
// It MUST live in src/: this project has a src/ directory, and Next.js only runs
// the hook from there. At the project root it was compiled but never executed
// on Vercel (measured 2026-11-20): Sentry never started on the servers and the
// environment check below never ran.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry first, so that a configuration problem found below is reported.
    await import('../sentry.server.config');

    // A missing variable is reported, never fatal: throwing here makes EVERY
    // request of the deployment answer 500 (seen on a preview without Stripe
    // keys), when only the feature that needs the variable is affected.
    const { validateEnv } = await import('./lib/env');
    try {
      validateEnv();
    } catch (error) {
      const { logger } = await import('./lib/logger');
      logger.error('Configuration invalide au demarrage du serveur', error);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
