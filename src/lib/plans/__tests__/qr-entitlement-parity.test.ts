import { describe, it, expect } from 'vitest';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan } from '@/types/billing';

/**
 * Guardrail against paywall drift between the TypeScript plan matrix
 * (canAccessFeature / PLAN_LIMITS in lib/plans/features.ts) and the SQL trigger
 * enforce_qr_customization_entitlement
 * (supabase/migrations/20260711080000_qr_customization_db_paywall.sql), which
 * hardcodes: (status='trial' AND trial_ends_at > now()) OR plan IN
 * ('pro','business','enterprise').
 *
 * If PLAN_LIMITS.canAccessQrCustomization changes (e.g. a new tier, or Starter
 * gains the feature), this test fails and forces a matching new trigger
 * migration - the two definitions must stay in sync.
 */

const ALL_PLANS: SubscriptionPlan[] = ['starter', 'pro', 'business', 'enterprise'];
const TRIGGER_ENTITLED_PLANS = new Set<SubscriptionPlan>(['pro', 'business', 'enterprise']);

describe('QR customization entitlement parity (TS matrix vs SQL trigger)', () => {
  it('non-trial: only pro/business/enterprise are entitled, matching the trigger plan list', () => {
    for (const plan of ALL_PLANS) {
      const tsAllows = canAccessFeature('canAccessQrCustomization', plan, 'active', null);
      expect(tsAllows).toBe(TRIGGER_ENTITLED_PLANS.has(plan));
    }
  });

  it('active trial grants access even on starter, matching the trigger trial clause', () => {
    const future = new Date(Date.now() + 30 * 864e5).toISOString();
    expect(canAccessFeature('canAccessQrCustomization', 'starter', 'trial', future)).toBe(true);
  });

  it('expired trial on starter is NOT entitled', () => {
    const past = '2020-01-01T00:00:00Z';
    expect(canAccessFeature('canAccessQrCustomization', 'starter', 'trial', past)).toBe(false);
  });
});
