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

// Log rate limiting status at module load (startup)
// Using console.warn to avoid circular dependency with logger at module level
if (!isConfigured) {
  // CONSOLE-PROD. L'ancien message annoncait "rate limiting disabled", ce qui
  // est FAUX en production: sans Redis, check() renvoie success:false et bloque
  // donc TOUTES les requetes limitees. Lire "desactive" au moment ou le site
  // refuse tout est exactement le message qui envoie chercher la panne ailleurs.
  console.warn(
    process.env.NODE_ENV === 'production'
      ? '[rate-limit] ERREUR: Redis non configure EN PRODUCTION - toutes les requetes limitees seront REFUSEES'
      : '[rate-limit] WARN: Redis non configure - limitation inactive hors production (les requetes passent)',
  );
}

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
  /** When true, Redis failure blocks the request instead of allowing it through */
  failClosed = false,
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
        if (failClosed) {
          // Security-critical endpoints: block on Redis failure to prevent brute-force
          logger.error('Rate limiter fetch failed, BLOCKING request (fail-closed)', err, {
            prefix,
          });
          return { success: false, limit: 0, remaining: 0, reset: 0 };
        }
        // Non-critical endpoints: allow through to avoid blocking legitimate traffic
        logger.error('Rate limiter fetch failed, allowing request through', err, { prefix });
        return { success: true, limit: 0, remaining: 0, reset: 0 };
      }
    },
  };
}

// --- Limiters per endpoint ---

/** Signup: 5 requests / 10 minutes per IP (fail-closed: brute-force protection) */
export const signupLimiter = createLimiter('signup', Ratelimit.slidingWindow(5, '10 m'), true);

/** OAuth signup: 5 requests / 10 minutes per IP (fail-closed: brute-force protection) */
export const oauthSignupLimiter = createLimiter(
  'signup-oauth',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/** Orders: 20 requests / minute per IP. RL-FAILOPEN: fail-closed - une panne
 *  Upstash ouvrait simultanement la creation de commandes et le formulaire de
 *  contact, soit les deux surfaces de spam les plus rentables du produit. */
export const orderLimiter = createLimiter('orders', Ratelimit.slidingWindow(20, '1 m'), true);

/**
 * ORDER-SPAM. Commandes dont le tenant n'est PAS etabli par une source serveur:
 * 5 par heure et par (IP, tenant), fail-closed.
 *
 * Sur le domaine principal, le slug ne peut venir que du `Referer`, forgeable
 * hors navigateur. Un script pouvait donc boucler sur
 * `POST https://attabl.com/api/orders` avec un `Referer` pointant un concurrent,
 * et chaque requete creait une VRAIE commande: notification et son en cuisine,
 * email comportemental, destockage si l'inventaire est actif, et surtout
 * consommation IRREVERSIBLE du budget d'un code promo via claimUsage.
 *
 * Ce compartiment ne touche pas le parcours client normal: un convive commande
 * depuis `<slug>.attabl.com` ou un domaine custom, donc avec un slug etabli par
 * le serveur, et ne passe jamais ici. Seule la commande depuis
 * `attabl.com/sites/<slug>/...` l'emprunte - un chemin marginal, ou 5 commandes
 * par heure restent largement au-dessus de l'usage reel.
 */
export const untrustedOrderLimiter = createLimiter(
  'orders-untrusted',
  Ratelimit.slidingWindow(5, '1 h'),
  true,
);

/** Menu search corpus: read-only GET, 60 requests / minute per IP (separate
 *  bucket so browsing the search modal cannot deplete the order limit). */
export const menuSearchLimiter = createLimiter('menu-search', Ratelimit.slidingWindow(60, '1 m'));

// KNIP-RL: `paymentInitiationLimiter` et `webhookLimiter` vivaient ici, exportes
// et jamais appeles. Mesure faite avant de trancher: ils n'ont AUCUN appelant
// possible. Les routes Wave et Orange Money n'existent pas encore, et le seul
// webhook du produit est celui de Stripe - qui ne doit surtout pas etre limite
// par IP: Stripe reessaie, et brider ses tentatives ferait perdre des evenements
// de facturation. Ils sont donc supprimes plutot que branches au hasard. Le jour
// ou la route Wave arrive, son limiteur tient en trois lignes, ecrites avec la
// fenetre que ce fournisseur exige vraiment.

/** Checkout: 5 requests / 10 minutes per IP. Fail-closed: block if Redis is down
 * in production to prevent unbounded checkout sessions during an outage. */
export const checkoutLimiter = createLimiter('checkout', Ratelimit.slidingWindow(5, '10 m'), true);

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

/** Contact form: 3 requests / hour per IP (RL-FAILOPEN: fail-closed). */
export const contactLimiter = createLimiter('contact', Ratelimit.slidingWindow(3, '1 h'), true);

/** Newsletter: 3 requests / hour per IP (RL-FAILOPEN: fail-closed). */
export const newsletterLimiter = createLimiter(
  'newsletter',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/** Excel menu import: 5 requests / hour per IP (fail-closed: costly ingest + abuse target) */
export const excelImportLimiter = createLimiter(
  'excel-import',
  Ratelimit.slidingWindow(5, '1 h'),
  true,
);

/** Supports/chevalet PDF export: 10 requests / minute per IP (authenticated admin, costly PDF render) */
export const supportsExportLimiter = createLimiter(
  'supports-export',
  Ratelimit.slidingWindow(10, '1 m'),
  true,
);

/** PDF menu import: 5 requests / hour per IP (fail-closed: costly ingest + abuse target) */
export const pdfImportLimiter = createLimiter(
  'pdf-import',
  Ratelimit.slidingWindow(5, '1 h'),
  true,
);

/** Assignments: 30 requests / minute per IP */
export const assignmentLimiter = createLimiter('assignment', Ratelimit.slidingWindow(30, '1 m'));

/**
 * Invitation management (authenticated: create / list / cancel / resend).
 * 30 requests / 10 minutes per IP, fail-closed (create/resend send emails).
 * Kept separate from the public accept/validate buckets so a manager's
 * dashboard activity never drains an invitee's quota.
 */
export const invitationManageLimiter = createLimiter(
  'invitation-manage',
  Ratelimit.slidingWindow(30, '10 m'),
  true,
);

/**
 * Invitation token validation (public, read-only on-mount check).
 * 30 requests / 10 minutes per TOKEN, fail-OPEN: no side effects (no account
 * creation, no email), so a Redis blip must not block a legitimate invitee.
 * Keyed by token, not IP, so CGNAT / shared-wifi users never collide.
 */
export const invitationValidateLimiter = createLimiter(
  'invitation-validate',
  Ratelimit.slidingWindow(30, '10 m'),
);

/**
 * Invitation acceptance (public, creates the account).
 * 10 requests / 10 minutes per token+IP, fail-closed. Keying on the token
 * scopes the budget to a single invitation, so neighbours behind the same NAT
 * cannot collectively exhaust each other's retries.
 */
export const invitationAcceptLimiter = createLimiter(
  'invitation-accept',
  Ratelimit.slidingWindow(10, '10 m'),
  true,
);

/** Permissions: 20 requests / minute per IP (fail-closed: privilege-escalation surface) */
export const permissionLimiter = createLimiter(
  'permission',
  Ratelimit.slidingWindow(20, '1 m'),
  true,
);

/** Push subscriptions: 10 requests / minute per IP */
export const pushSubscriptionLimiter = createLimiter(
  'push-subscription',
  Ratelimit.slidingWindow(10, '1 m'),
);

/** Domain verification: 5 requests / 10 minutes per IP (fail-closed: external DNS calls) */
export const domainVerifyLimiter = createLimiter(
  'domain-verify',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/** Restaurant creation: 5 requests / 10 minutes per IP (fail-closed: tenant-factory abuse target) */
export const restaurantCreateLimiter = createLimiter(
  'restaurant-create',
  Ratelimit.slidingWindow(5, '10 m'),
  true,
);

/** Stock alerts: 10 requests / minute per IP */
export const stockAlertLimiter = createLimiter('stock-alert', Ratelimit.slidingWindow(10, '1 m'));

/** Auth signout: 10 requests / minute per IP */
export const signoutLimiter = createLimiter('signout', Ratelimit.slidingWindow(10, '1 m'));

/** Forgot password: 3 requests / 10 minutes per IP (fail-closed: brute-force protection) */
export const forgotPasswordLimiter = createLimiter(
  'forgot-password',
  Ratelimit.slidingWindow(3, '10 m'),
  true,
);

/** Resend confirmation email: 3 requests / 10 minutes per IP (fail-closed: email enumeration + abuse) */
export const resendConfirmationLimiter = createLimiter(
  'resend-confirmation',
  Ratelimit.slidingWindow(3, '10 m'),
  true,
);

/** File upload: 20 requests / minute per IP (fail-closed: Storage quota / cost abuse) */
export const uploadLimiter = createLimiter('upload', Ratelimit.slidingWindow(20, '1 m'), true);

/** Admin reset: 3 requests / hour per IP (fail-closed: destructive action) */
export const adminResetLimiter = createLimiter(
  'admin-reset',
  Ratelimit.slidingWindow(3, '1 h'),
  true,
);

/** Login: 5 requests / 15 minutes per IP (fail-closed: brute-force protection) - NIST SP 800-63B */
export const loginLimiter = createLimiter('login', Ratelimit.slidingWindow(5, '15 m'), true);

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

// --- IP extraction helpers ---

/**
 * Extract client IP from a Request object (API routes).
 * Checks x-forwarded-for, x-real-ip, then falls back to 'anonymous'.
 *
 * IP-SPOOF - HYPOTHESE D'HEBERGEMENT, a relire si elle change.
 *
 * On retient le PREMIER element de `X-Forwarded-For`, qui est la partie la plus
 * a gauche donc la plus facile a forger: n'importe qui peut envoyer
 * `X-Forwarded-For: 1.2.3.4` et se fabriquer un compartiment de debit neuf a
 * chaque requete, ce qui annule la limitation.
 *
 * C'est inoperant ICI parce que Vercel PREPEND l'IP reelle a l'en-tete avant
 * que la requete n'atteigne la fonction: le premier element est donc toujours
 * celui du proxy, pas celui du client. La garantie vient de l'hebergeur, pas de
 * ce code.
 *
 * Si le projet quitte Vercel, ou passe derriere un proxy supplementaire, cette
 * fonction devient une passoire et doit etre reecrite pour lire l'element a
 * DROITE (le dernier ajoute par l'infrastructure de confiance), ou pour se fier
 * a un en-tete signe par le proxy.
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
