/**
 * Environment variable validation.
 *
 * Imported in instrumentation.ts (or next.config) to validate
 * required env vars exist at startup instead of failing at runtime.
 */

const requiredServer = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const requiredForStripe = [
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

const warnIfMissing = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SENTRY_DSN'] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of requiredServer) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Stripe is required in production but optional in dev/test
  if (process.env.NODE_ENV === 'production') {
    for (const key of requiredForStripe) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    } else {
      console.warn(`[env] WARNING: ${message}`);
    }
  }

  // Warn about optional-but-important vars in production
  if (process.env.NODE_ENV === 'production') {
    const warnings: string[] = [];
    for (const key of warnIfMissing) {
      if (!process.env[key]) {
        warnings.push(key);
      }
    }
    if (warnings.length > 0) {
      console.warn(`[env] WARNING: Optional but recommended vars missing: ${warnings.join(', ')}`);
    }
  }
}
