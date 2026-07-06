import { describe, it, expect } from 'vitest';
import { getPlanLimits, type FeatureKey, type PlanLimits } from '@/lib/plans/features';
import { featureCategories, type ComparisonValue } from '@/app/(marketing)/pricing/pricing-data';
import type { SubscriptionPlan } from '@/types/billing';

/**
 * Source-of-truth parity guard.
 *
 * The pricing page (src/app/(marketing)/pricing/pricing-data.ts) is the commercial
 * contract: what each plan advertises. PLAN_LIMITS (src/lib/plans/features.ts) is
 * what the app actually enforces. This test fails the build the moment the two
 * diverge, so a plan can never silently grant more (or less) than what is sold.
 *
 * Grouping is by module: several advertised lines (stock/suppliers/restockAlerts,
 * advancedReports/multiSiteReports) map to a single enforcement flag on purpose.
 */

const PLANS: SubscriptionPlan[] = ['starter', 'pro', 'business', 'enterprise'];

// Advertised boolean feature line -> enforcement flag it maps to.
const BOOLEAN_FEATURE_MAP: Record<string, FeatureKey> = {
  qrCustomization: 'canAccessQrCustomization',
  deliveryOrders: 'canAccessDelivery',
  roomService: 'canAccessRoomService',
  pos: 'canAccessPOS',
  multiCurrency: 'canAccessMultiCurrency',
  tips: 'canAccessTips',
  kds: 'canAccessKDS',
  tables: 'canAccessTables',
  assignments: 'canAccessService',
  stock: 'canAccessInventory',
  recipes: 'canAccessRecipes',
  suppliers: 'canAccessInventory',
  restockAlerts: 'canAccessInventory',
  salesReports: 'canAccessReports',
  bestSellers: 'canAccessReports',
  advancedReports: 'canAccessAIAnalytics',
  multiSiteReports: 'canAccessAIAnalytics',
};

// Advertised quantitative line -> numeric limit field.
const QUANT_MAP: Record<string, keyof PlanLimits> = {
  establishments: 'maxVenues',
  admins: 'maxAdmins',
  staff: 'maxStaff',
  monthlyOrders: 'maxMonthlyOrders',
  menus: 'maxMenus',
  items: 'maxItems',
};

// Advertised lines that are true on every plan and need no enforcement flag.
const ALWAYS_ON = new Set(['qrMenu', 'onsiteOrders', 'takeawayOrders', 'dashboard', 'email']);

// Support lines are commercial copy, not enforced feature flags.
const SUPPORT_ONLY = new Set(['whatsapp', 'manager', 'sla']);

// Enforcement flags with no advertised pricing line. Every boolean flag now maps
// to a pricing line; keep the list so a future internal-only flag can be documented.
const FLAGS_WITHOUT_PRICING_LINE: FeatureKey[] = [];

/** Non-trial limits for a plan (status 'active' so the trial->pro override is off). */
function limitsFor(plan: SubscriptionPlan): PlanLimits {
  return getPlanLimits(plan, 'active', null);
}

function quantValue(v: ComparisonValue): number {
  if (typeof v === 'boolean') throw new Error('quantitative line has a boolean value');
  if (v.kind === 'unlimited') return -1;
  return parseInt(v.value.replace(/[\s\u00A0\u2009]/g, ''), 10);
}

const allRows = featureCategories.flatMap((c) => c.features);

describe('pricing <-> PLAN_LIMITS parity', () => {
  it('every advertised line is a known boolean feature, quantitative limit, or documented exception', () => {
    for (const row of allRows) {
      const known =
        row.labelKey in BOOLEAN_FEATURE_MAP ||
        row.labelKey in QUANT_MAP ||
        ALWAYS_ON.has(row.labelKey) ||
        SUPPORT_ONLY.has(row.labelKey);
      expect(known, `pricing line "${row.labelKey}" is not mapped to PLAN_LIMITS`).toBe(true);
    }
  });

  for (const plan of PLANS) {
    describe(`plan: ${plan}`, () => {
      const limits = limitsFor(plan);

      for (const row of allRows) {
        const flag = BOOLEAN_FEATURE_MAP[row.labelKey];
        if (flag) {
          it(`${row.labelKey} matches ${flag}`, () => {
            expect(typeof row[plan]).toBe('boolean');
            expect(limits[flag]).toBe(row[plan]);
          });
          continue;
        }

        const field = QUANT_MAP[row.labelKey];
        if (field) {
          it(`${row.labelKey} matches ${field}`, () => {
            expect(limits[field]).toBe(quantValue(row[plan]));
          });
        }
      }
    });
  }

  it('every boolean enforcement flag is covered by a pricing line or a documented exception', () => {
    const starter = limitsFor('starter');
    const booleanFlags = (Object.keys(starter) as FeatureKey[]).filter(
      (k) => typeof starter[k] === 'boolean',
    );
    const mapped = new Set<FeatureKey>(Object.values(BOOLEAN_FEATURE_MAP));
    for (const flag of booleanFlags) {
      const covered = mapped.has(flag) || FLAGS_WITHOUT_PRICING_LINE.includes(flag);
      expect(covered, `enforcement flag "${flag}" has no pricing line and is not documented`).toBe(
        true,
      );
    }
  });
});
