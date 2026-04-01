import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

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
        if (process.env.NODE_ENV === 'production') {
          logger.error(
            'Rate limiting is DISABLED in production - UPSTASH_REDIS not configured. Blocking request.',
          );
          return { success: false, limit: 0, remaining: 0, reset: 0 };
        }
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }

      try {
        const result = await rl.limit(identifier);
        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        };
      } catch (err) {
        // Upstash connection failure - allow request through to avoid blocking
        // legitimate traffic when Redis is temporarily unreachable
        logger.error('Rate limiter fetch failed, allowing request through', err, { prefix });
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }
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

/** Onboarding state (GET): loaded once on page open */
export const onboardingStateLimiter = createLimiter(
  'onboarding-state',
  Ratelimit.slidingWindow(10, '10 m'),
);

/** Onboarding save (POST auto-save): fires every 2s on data change */
export const onboardingSaveLimiter = createLimiter(
  'onboarding-save',
  Ratelimit.slidingWindow(60, '1 m'),
);

/** Onboarding complete (POST launch): one-shot final action */
export const onboardingCompleteLimiter = createLimiter(
  'onboarding-complete',
  Ratelimit.slidingWindow(5, '10 m'),
);

/** Contact form: 3 requests / hour per IP */
export const contactLimiter = createLimiter('contact', Ratelimit.slidingWindow(3, '1 h'));

/** Newsletter: 3 requests / hour per IP */
export const newsletterLimiter = createLimiter('newsletter', Ratelimit.slidingWindow(3, '1 h'));

/** Excel menu import: 5 requests / hour per IP */
export const excelImportLimiter = createLimiter('excel-import', Ratelimit.slidingWindow(5, '1 h'));

/** PDF menu import: 5 requests / hour per IP */
export const pdfImportLimiter = createLimiter('pdf-import', Ratelimit.slidingWindow(5, '1 h'));

/** Assignments: 30 requests / minute per IP */
export const assignmentLimiter = createLimiter('assignment', Ratelimit.slidingWindow(30, '1 m'));

/** Invitations: 5 requests / 10 minutes per IP */
export const invitationLimiter = createLimiter('invitation', Ratelimit.slidingWindow(5, '10 m'));

/** Permissions: 20 requests / minute per IP */
export const permissionLimiter = createLimiter('permission', Ratelimit.slidingWindow(20, '1 m'));

/** Push subscriptions: 10 requests / minute per IP */
export const pushSubscriptionLimiter = createLimiter(
  'push-subscription',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Domain verification: 5 requests / 10 minutes per IP */
export const domainVerifyLimiter = createLimiter(
  'domain-verify',
  Ratelimit.slidingWindow(5, '10 m'),
);

/** Restaurant creation: 5 requests / 10 minutes per IP */
export const restaurantCreateLimiter = createLimiter(
  'restaurant-create',
  Ratelimit.slidingWindow(5, '10 m'),
);

/** Stock alerts: 10 requests / minute per IP */
export const stockAlertLimiter = createLimiter('stock-alert', Ratelimit.slidingWindow(10, '1 m'));

/** Auth signout: 10 requests / minute per IP */
export const signoutLimiter = createLimiter('signout', Ratelimit.slidingWindow(10, '1 m'));

/** Forgot password: 3 requests / 10 minutes per IP */
export const forgotPasswordLimiter = createLimiter(
  'forgot-password',
  Ratelimit.slidingWindow(3, '10 m'),
);

/** Resend confirmation email: 3 requests / 10 minutes per IP */
export const resendConfirmationLimiter = createLimiter(
  'resend-confirmation',
  Ratelimit.slidingWindow(3, '10 m'),
);

/** File upload: 20 requests / minute per IP */
export const uploadLimiter = createLimiter('upload', Ratelimit.slidingWindow(20, '1 m'));

/** Admin reset: 3 requests / hour per IP */
export const adminResetLimiter = createLimiter('admin-reset', Ratelimit.slidingWindow(3, '1 h'));

/** Login: 10 requests / 5 minutes per IP */
export const loginLimiter = createLimiter('login', Ratelimit.slidingWindow(10, '5 m'));

/** Billing portal: 10 requests / minute per IP */
export const billingPortalLimiter = createLimiter(
  'billing-portal',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Revalidate menu cache: 20 requests / minute per IP */
export const revalidateMenuLimiter = createLimiter(
  'revalidate-menu',
  Ratelimit.slidingWindow(20, '1 m'),
);

/** Server actions (generic): 30 requests / minute per IP */
export const serverActionLimiter = createLimiter(
  'server-action',
  Ratelimit.slidingWindow(30, '1 m'),
);

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
