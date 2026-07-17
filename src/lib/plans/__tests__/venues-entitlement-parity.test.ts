import { describe, it, expect } from 'vitest';
import { getPlanLimits } from '@/lib/plans/features';
import type { SubscriptionPlan } from '@/types/billing';

/**
 * Guardrail contre la derive entre la matrice TS (PLAN_LIMITS.maxVenues) et le
 * CASE du trigger SQL enforce_venue_plan_limit
 * (supabase/migrations/20260717120000_venues_plan_limit_trigger.sql).
 * Si maxVenues change, ce test casse et force une migration correctrice.
 */
const SQL_MAX_VENUES: Record<SubscriptionPlan, number> = {
  starter: 1,
  pro: 2,
  business: 10,
  enterprise: -1, // NULL cote SQL = illimite ; -1 cote TS
};

describe('venue plan-limit parity (TS PLAN_LIMITS vs SQL trigger CASE)', () => {
  it('maxVenues TS == plafond SQL pour chaque plan (non-trial)', () => {
    (Object.keys(SQL_MAX_VENUES) as SubscriptionPlan[]).forEach((plan) => {
      const ts = getPlanLimits(plan, 'active', null).maxVenues;
      expect(ts).toBe(SQL_MAX_VENUES[plan]);
    });
  });

  it('trial actif = plafond pro (2) meme sur starter', () => {
    const future = new Date(Date.now() + 30 * 864e5).toISOString();
    expect(getPlanLimits('starter', 'trial', future).maxVenues).toBe(2);
  });
});
