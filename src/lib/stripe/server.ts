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

// Prix des plans (Price IDs Stripe)
export const STRIPE_PRICES: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, string>
> = {
  starter: {
    monthly: 'price_1TBiOXFJRfQ8oV7tbeMdLfJh',
    semiannual: 'price_1TBiOdFJRfQ8oV7t8cVwPvKv',
    yearly: 'price_1TBiOfFJRfQ8oV7tJFAxrX0H',
  },
  pro: {
    monthly: 'price_1TBiOgFJRfQ8oV7t1sDlMPUd',
    semiannual: 'price_1TBiOhFJRfQ8oV7tqjY1GmpO',
    yearly: 'price_1TBiOiFJRfQ8oV7t1cI4W91M',
  },
  business: {
    monthly: 'price_1TBiOjFJRfQ8oV7tqtXPlGQS',
    semiannual: 'price_1TBiOlFJRfQ8oV7tFQ0efHSw',
    yearly: 'price_1TBiO3FJRfQ8oV7tI3oVNuHT',
  },
};

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
