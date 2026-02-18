import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting module powered by Upstash Redis.
 *
 * Graceful mode: if UPSTASH_REDIS_REST_URL is not set, all checks pass
 * (no crash in development or CI without Redis).
 *
 * Usage in API routes:
 *   import { signupLimiter, getClientIp } from '@/lib/rate-limit';
 *   const ip = getClientIp(request);
 *   const { success } = await signupLimiter.check(ip);
 *   if (!success) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
 *
 * Usage in Server Actions:
 *   import { contactLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
 *   const headersList = await headers();
 *   const ip = getClientIpFromHeaders(headersList);
 *   const { success } = await contactLimiter.check(ip);
 */

// --- Redis client (shared) ---

const isConfigured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// --- Rate limit result type ---

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// --- Limiter factory ---

function createLimiter(
  prefix: string,
  limiter: ConstructorParameters<typeof Ratelimit>[0]['limiter'],
) {
  const rl = redis
    ? new Ratelimit({
        redis,
        limiter,
        prefix: `attabl:${prefix}`,
      })
    : null;

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      if (!rl) {
        // Graceful: no Redis configured → always allow
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }

      const result = await rl.limit(identifier);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
}

// --- Limiters per endpoint ---

/** Signup: 5 requests / 10 minutes per IP */
export const signupLimiter = createLimiter('signup', Ratelimit.slidingWindow(5, '10 m'));

/** OAuth signup: 5 requests / 10 minutes per IP */
export const oauthSignupLimiter = createLimiter('signup-oauth', Ratelimit.slidingWindow(5, '10 m'));

/** Orders: 20 requests / minute per IP */
export const orderLimiter = createLimiter('orders', Ratelimit.slidingWindow(20, '1 m'));

/** Checkout: 5 requests / 10 minutes per IP */
export const checkoutLimiter = createLimiter('checkout', Ratelimit.slidingWindow(5, '10 m'));

/** Verify checkout: 10 requests / minute per IP */
export const verifyCheckoutLimiter = createLimiter(
  'verify-checkout',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Onboarding: 10 requests / minute per IP */
export const onboardingLimiter = createLimiter('onboarding', Ratelimit.slidingWindow(10, '1 m'));

/** Contact form: 3 requests / hour per IP */
export const contactLimiter = createLimiter('contact', Ratelimit.slidingWindow(3, '1 h'));

/** Newsletter: 3 requests / hour per IP */
export const newsletterLimiter = createLimiter('newsletter', Ratelimit.slidingWindow(3, '1 h'));

/** Excel menu import: 5 requests / hour per IP */
export const excelImportLimiter = createLimiter('excel-import', Ratelimit.slidingWindow(5, '1 h'));

/** Assignments: 30 requests / minute per IP */
export const assignmentLimiter = createLimiter('assignment', Ratelimit.slidingWindow(30, '1 m'));

/** Invitations: 5 requests / 10 minutes per IP */
export const invitationLimiter = createLimiter('invitation', Ratelimit.slidingWindow(5, '10 m'));

/** Permissions: 20 requests / minute per IP */
export const permissionLimiter = createLimiter('permission', Ratelimit.slidingWindow(20, '1 m'));

// --- IP extraction helpers ---

/**
 * Extract client IP from a Request object (API routes).
 * Checks x-forwarded-for, x-real-ip, then falls back to 'anonymous'.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'anonymous';
}

/**
 * Extract client IP from a Headers object (Server Actions).
 * Use with `const headersList = await headers();`
 */
export function getClientIpFromHeaders(headersList: Headers): string {
  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = headersList.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'anonymous';
}
