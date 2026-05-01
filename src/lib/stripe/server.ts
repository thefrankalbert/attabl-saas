import Stripe from 'stripe';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

// Re-export pricing constants for backwards compatibility (server-side callers)
export { PLAN_AMOUNTS, PLAN_TOTALS, getPlanAmount } from './pricing';

// Client Stripe cote serveur - lazy initialized to avoid crash if env var is missing at import time
let _stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripeInstance = new Stripe(key);
  }
  return _stripeInstance;
}

/**
 * Lazy-initialized Stripe client.
 * Access is deferred until first property access so missing env vars
 * do not crash the process at import time.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getStripe(), prop);
  },
});

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

type StripePriceMap = Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, string>
>;

// Lazy-initialized to avoid requireEnv() crash at import time when env vars are absent
let _stripePricesInstance: StripePriceMap | null = null;

function getStripePricesInstance(): StripePriceMap {
  if (!_stripePricesInstance) {
    _stripePricesInstance = {
      starter: {
        monthly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY'),
        semiannual: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_STARTER_SEMIANNUAL'),
        yearly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY'),
      },
      pro: {
        monthly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY'),
        semiannual: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO_SEMIANNUAL'),
        yearly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY'),
      },
      business: {
        monthly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY'),
        semiannual: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_SEMIANNUAL'),
        yearly: requireEnv('NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY'),
      },
    };
  }
  return _stripePricesInstance;
}

// Proxy defers requireEnv() calls until first property access (same pattern as `stripe`)
export const STRIPE_PRICES: StripePriceMap = new Proxy({} as StripePriceMap, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getStripePricesInstance(), prop);
  },
});

// Helper pour obtenir le Price ID correct
export function getStripePriceId(
  plan: Exclude<SubscriptionPlan, 'enterprise'>,
  interval: BillingInterval,
): string {
  return STRIPE_PRICES[plan][interval];
}

// Reverse-lookup: find plan name from a Stripe price ID
export function getPlanFromPriceId(
  priceId: string,
): Exclude<SubscriptionPlan, 'enterprise'> | null {
  for (const [plan, intervals] of Object.entries(STRIPE_PRICES)) {
    for (const [, id] of Object.entries(intervals)) {
      if (id === priceId) return plan as Exclude<SubscriptionPlan, 'enterprise'>;
    }
  }
  return null;
}

// Reverse-lookup: find billing interval from a Stripe price ID
export function getIntervalFromPriceId(priceId: string): BillingInterval | null {
  for (const [, intervals] of Object.entries(STRIPE_PRICES)) {
    for (const [interval, id] of Object.entries(intervals)) {
      if (id === priceId) return interval as BillingInterval;
    }
  }
  return null;
}
