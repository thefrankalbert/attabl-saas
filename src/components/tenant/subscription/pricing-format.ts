import { PLAN_AMOUNTS, PLAN_TOTALS } from '@/lib/stripe/pricing';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

export type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

export const SELF_SERVICE_PLANS: SelfServicePlan[] = ['starter', 'pro', 'business'];
// Only monthly and yearly are offered in the UI. The `semiannual` interval stays
// in the BillingInterval type for existing subscriptions and Stripe pricing data.
export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'yearly'];

/**
 * Percent saved versus the monthly price for a given interval. The discount is
 * uniform across plans (all -20% yearly / -15% semiannual), so it is computed
 * once from the starter reference. Returns 0 for monthly.
 */
export function intervalSavingsPct(interval: BillingInterval): number {
  if (interval === 'monthly') return 0;
  const monthly = PLAN_AMOUNTS.starter.monthly;
  const rate = PLAN_AMOUNTS.starter[interval];
  return Math.round((1 - rate / monthly) * 100);
}

/** Monthly-equivalent display price for a plan at a given interval. */
export function planMonthlyPrice(plan: SelfServicePlan, interval: BillingInterval): number {
  return PLAN_AMOUNTS[plan][interval];
}

/** Total amount actually billed by Stripe for a plan at a given interval. */
export function planBilledTotal(plan: SelfServicePlan, interval: BillingInterval): number {
  return PLAN_TOTALS[plan][interval];
}
