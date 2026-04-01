/**
 * Stripe pricing constants - safe to import from client AND server components.
 * The Stripe SDK and secret key live in server.ts (server-only).
 */
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

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

// Helper pour obtenir le montant en FCFA
export function getPlanAmount(
  plan: Exclude<SubscriptionPlan, 'enterprise'>,
  interval: BillingInterval,
): number {
  return PLAN_AMOUNTS[plan][interval];
}
