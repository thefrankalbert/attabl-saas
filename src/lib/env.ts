/**
 * Environment variable validation.
 *
 * Imported in instrumentation.ts (or next.config) to validate
 * required env vars exist and are well-formed at startup instead
 * of failing at runtime.
 *
 * The required set is intentionally identical to the historical
 * presence-only checks: do not add new required vars here or boot
 * will break in environments that never provisioned them.
 */

import { z } from 'zod';

// Reusable field builders.
// Empty strings are treated as missing (matches the old `!process.env[key]` behavior).
const nonEmptyString = (name: string) => z.string().trim().min(1, `${name} is missing`);

const urlString = (name: string) => nonEmptyString(name).url(`${name} must be a valid URL`);

// Always required (server boot). Same set as the old `requiredServer`.
const requiredServerSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlString('NEXT_PUBLIC_SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmptyString('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString('SUPABASE_SERVICE_ROLE_KEY'),
});

// Required in production only. Same set as the old `requiredForStripe`.
const requiredStripeSchema = z.object({
  STRIPE_SECRET_KEY: nonEmptyString('STRIPE_SECRET_KEY'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: nonEmptyString('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  STRIPE_WEBHOOK_SECRET: nonEmptyString('STRIPE_WEBHOOK_SECRET'),
});

// Optional but recommended in production. Same set as the old `warnIfMissing`.
// Format-checked when present (URL shape for the Upstash REST URL), never required.
const recommendedSchema = z.object({
  UPSTASH_REDIS_REST_URL: urlString('UPSTASH_REDIS_REST_URL').optional(),
  UPSTASH_REDIS_REST_TOKEN: nonEmptyString('UPSTASH_REDIS_REST_TOKEN').optional(),
  SENTRY_DSN: nonEmptyString('SENTRY_DSN').optional(),
});

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path.join('.');
      return key ? `${key} (${issue.message})` : issue.message;
    })
    .filter((message, index, all) => all.indexOf(message) === index)
    .join(', ');
}

export function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  // Always-required server vars.
  const serverResult = requiredServerSchema.safeParse(process.env);
  if (!serverResult.success) {
    errors.push(formatIssues(serverResult.error));
  }

  // Stripe is required in production but optional in dev/test.
  if (isProduction) {
    const stripeResult = requiredStripeSchema.safeParse(process.env);
    if (!stripeResult.success) {
      errors.push(formatIssues(stripeResult.error));
    }
  }

  if (errors.length > 0) {
    const message = `Invalid or missing required environment variables: ${errors.join(', ')}`;
    if (isProduction) {
      throw new Error(message);
    } else {
      console.warn(`[env] WARNING: ${message}`);
    }
  }

  // Validate optional-but-important vars (format only). These are never required,
  // so a malformed value warns but never throws - it must not break boot.
  const recommendedResult = recommendedSchema.safeParse(process.env);
  if (!recommendedResult.success) {
    console.warn(
      `[env] WARNING: Malformed optional environment variables: ${formatIssues(recommendedResult.error)}`,
    );
  }

  if (isProduction) {
    const recommendedKeys = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SENTRY_DSN'];
    const warnings = recommendedKeys.filter((key) => !process.env[key]);
    if (warnings.length > 0) {
      console.warn(`[env] WARNING: Optional but recommended vars missing: ${warnings.join(', ')}`);
    }
  }
}
