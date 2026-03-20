import Stripe from 'stripe';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

// Client Stripe côté serveur
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

// Display amounts per month in XAF (semiannual/yearly show equivalent monthly)
export const PLAN_AMOUNTS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, semiannual: 33150, yearly: 31200 },
  pro: { monthly: 79000, semiannual: 67150, yearly: 63200 },
  business: { monthly: 149000, semiannual: 126650, yearly: 119200 },
};

// Total billed amounts (what Stripe charges)
export const PLAN_TOTALS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, semiannual: 198900, yearly: 374400 },
  pro: { monthly: 79000, semiannual: 402900, yearly: 758400 },
  business: { monthly: 149000, semiannual: 759900, yearly: 1430400 },
};

// Helper pour obtenir le Price ID correct
export function getStripePriceId(
  plan: Exclude<SubscriptionPlan, 'enterprise'>,
  interval: BillingInterval,
): string {
  return STRIPE_PRICES[plan][interval];
}

// Helper pour obtenir le montant en FCFA
export function getPlanAmount(
  plan: Exclude<SubscriptionPlan, 'enterprise'>,
  interval: BillingInterval,
): number {
  return PLAN_AMOUNTS[plan][interval];
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
