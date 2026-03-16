# Stripe Billing V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete subscription lifecycle with new plans (STARTER/PRO/BUSINESS), semiannual billing, frozen mode, grace period, billing portal, and expanded webhooks.

**Architecture:** Update existing Stripe integration in-place. New plans replace essentiel/premium. Add `frozen` status and `semiannual` interval. Billing portal via Stripe Customer Portal API. Grace period logic in webhook handler.

**Tech Stack:** Stripe API, Next.js 16 API Routes, Supabase, Zod validation, TypeScript strict mode.

**Working directory:** `/Users/a.g.i.c/Desktop/attabl-saas/.worktrees/stripe-billing-v2`

**Stripe Price IDs (test mode, XAF zero-decimal):**

| Plan     | Monthly                          | Semiannual                       | Yearly                           |
| -------- | -------------------------------- | -------------------------------- | -------------------------------- |
| STARTER  | `price_1TBiOXFJRfQ8oV7tbeMdLfJh` | `price_1TBiOdFJRfQ8oV7t8cVwPvKv` | `price_1TBiOfFJRfQ8oV7tJFAxrX0H` |
| PRO      | `price_1TBiOgFJRfQ8oV7t1sDlMPUd` | `price_1TBiOhFJRfQ8oV7tqjY1GmpO` | `price_1TBiOiFJRfQ8oV7t1cI4W91M` |
| BUSINESS | `price_1TBiOjFJRfQ8oV7tqtXPlGQS` | `price_1TBiOlFJRfQ8oV7tFQ0efHSw` | `price_1TBiO3FJRfQ8oV7tI3oVNuHT` |

---

## Task 1: Update types and Stripe config

**Files:**

- Modify: `src/types/billing.ts`
- Modify: `src/lib/stripe/server.ts`

- [ ] **Step 1: Update billing types**

Replace `src/types/billing.ts` with:

```typescript
export type SubscriptionPlan = 'starter' | 'pro' | 'business' | 'enterprise';
export type BillingInterval = 'monthly' | 'semiannual' | 'yearly';
export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'frozen';

export interface CreateCheckoutRequest {
  plan: Exclude<SubscriptionPlan, 'enterprise'>;
  interval: BillingInterval;
}

export interface CreateCheckoutResponse {
  sessionId: string;
  url: string;
}
```

- [ ] **Step 2: Update Stripe server config**

Replace `src/lib/stripe/server.ts` STRIPE_PRICES, PLAN_AMOUNTS, and helper functions with the new 3-plan x 3-interval structure using the price IDs created in Stripe.

```typescript
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

export const PLAN_AMOUNTS: Record<
  Exclude<SubscriptionPlan, 'enterprise'>,
  Record<BillingInterval, number>
> = {
  starter: { monthly: 39000, semiannual: 33150, yearly: 31200 },
  pro: { monthly: 79000, semiannual: 67150, yearly: 63200 },
  business: { monthly: 149000, semiannual: 126650, yearly: 119200 },
};
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Fix any type errors caused by `'essentiel' | 'premium'` -> `'starter' | 'pro' | 'business'` rename across the codebase. This will cascade — fix ALL references.

- [ ] **Step 4: Run tests, fix failures**

```bash
pnpm test
```

Update test files that reference 'essentiel' or 'premium' plan names.

---

## Task 2: Update plan features/limits

**Files:**

- Modify: `src/lib/plans/features.ts`

- [ ] **Step 1: Rewrite PLAN_LIMITS with new plans**

Replace the 3 plan definitions with:

- **STARTER**: 1 venue, 1 admin, 3 staff max, POS basic, menu QR, dine-in + takeaway only, basic dashboard. NO KDS, NO stock, NO tables, NO multi-currency, NO recipes, NO suppliers.
- **PRO**: 1 venue, 1 admin, 10 staff, full POS, KDS, tables + servers, tips, stock + recipes, suppliers, multi-currency, sales reports, team management (roles/permissions). Trial defaults to PRO.
- **BUSINESS**: 10 venues, unlimited admins, unlimited staff, everything in PRO + room service, delivery, AI analytics, multi-site reports.
- **ENTERPRISE**: unlimited everything (managed manually).

Update `PLAN_NAMES` to: `{ starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' }`.

Update `getEffectivePlan()`: trial users get **PRO** access (not premium).

- [ ] **Step 2: Update isSubscriptionUsable()**

Add `frozen` status handling — `frozen` returns `false` (not usable).

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

---

## Task 3: Update checkout and webhook handlers

**Files:**

- Modify: `src/app/api/create-checkout-session/route.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify: `src/lib/validations/` (checkout schema)

- [ ] **Step 1: Update checkout Zod schema**

Update the checkout body schema to accept `plan: 'starter' | 'pro' | 'business'` and `interval: 'monthly' | 'semiannual' | 'yearly'`.

- [ ] **Step 2: Update webhook status mapping**

Add `frozen` status. When `customer.subscription.deleted` is received, set status to `frozen` instead of `cancelled`. Add handler for `customer.subscription.trial_will_end` and `invoice.payment_action_required`.

- [ ] **Step 3: Add plan change detection in subscription.updated**

When `customer.subscription.updated` fires, check if the plan/price changed and update `subscription_plan` accordingly (reverse-lookup price ID to plan name).

- [ ] **Step 4: Run typecheck + tests**

```bash
pnpm typecheck && pnpm test
```

---

## Task 4: Billing portal endpoint

**Files:**

- Create: `src/app/api/billing-portal/route.ts`

- [ ] **Step 1: Create billing portal route**

```typescript
// POST /api/billing-portal
// Auth required. Creates a Stripe Customer Portal session.
// Returns { url: string } for redirect.
```

Rate limit, auth check, get stripe_customer_id from tenant, create portal session, return URL.

- [ ] **Step 2: Run typecheck + lint**

---

## Task 5: Frozen mode implementation

**Files:**

- Create: `src/components/shared/FrozenBanner.tsx`
- Modify: `src/contexts/SubscriptionContext.tsx`
- Modify: `src/services/plan-enforcement.service.ts`

- [ ] **Step 1: Create FrozenBanner component**

Similar to TrialBanner. Shows: "Votre essai a expire. Choisissez un plan pour continuer." with link to pricing. Shown when status is `frozen`.

- [ ] **Step 2: Update SubscriptionContext**

Add `isFrozen` boolean to context. Derived from `status === 'frozen'`.

- [ ] **Step 3: Update plan enforcement**

In `plan-enforcement.service.ts`, add a check at the top of every mutation method: if tenant status is `frozen`, throw `ServiceError('FROZEN', 'Votre compte est gele. Veuillez choisir un plan.')`.

- [ ] **Step 4: Run typecheck + tests**

---

## Task 6: Grace period (past_due handling)

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Create: `src/components/shared/PastDueBanner.tsx`

- [ ] **Step 1: Update invoice.payment_failed handler**

Keep status as `past_due` (already done). Do NOT freeze immediately. The grace period is handled by Stripe Smart Retries (7 days). Only when `customer.subscription.deleted` fires after dunning exhaustion do we set `frozen`.

- [ ] **Step 2: Create PastDueBanner**

Shows: "Votre paiement a echoue. Mettez a jour votre carte." with link to billing portal.

- [ ] **Step 3: Add banner to admin layout**

Show PastDueBanner when `status === 'past_due'`, show FrozenBanner when `status === 'frozen'`.

---

## Task 7: Update SubscriptionManager UI

**Files:**

- Modify: `src/components/tenant/SubscriptionManager.tsx`

- [ ] **Step 1: Rewrite plan cards**

3 plan cards (Starter, Pro, Business) + Enterprise "Contactez-nous". Import prices from `PLAN_AMOUNTS` instead of hardcoding.

- [ ] **Step 2: Add 3-position billing toggle**

"Mensuel" | "6 mois -15%" | "Annuel -20%" toggle. State controls which prices are displayed and which interval is passed to checkout.

- [ ] **Step 3: Add billing portal link**

"Gerer ma carte" button that calls `/api/billing-portal` and redirects.

- [ ] **Step 4: Run typecheck + lint**

---

## Task 8: Update pricing page

**Files:**

- Modify: `src/app/(marketing)/pricing/page.tsx`

- [ ] **Step 1: Update plan cards to STARTER/PRO/BUSINESS**

3 cards with correct features per plan. Enterprise as "Contactez-nous".

- [ ] **Step 2: Update billing toggle to 3 positions**

"Mensuel" | "6 mois -15%" | "Annuel -20%". Prices update instantly.

- [ ] **Step 3: Pass interval to signup link**

The "Commencer" link should include `?plan=starter&interval=monthly` (or selected values) so checkout knows the billing interval.

---

## Task 9: Update i18n and fix references

**Files:**

- Modify: `src/messages/fr-FR.json`
- Modify: `src/messages/en-US.json`
- Grep and fix: any remaining `'essentiel'` or `'premium'` references

- [ ] **Step 1: Search and replace plan names in i18n**

Replace `essentiel` with `starter`, `premium` with `pro` in all i18n keys.

- [ ] **Step 2: Grep entire codebase for stale references**

```bash
grep -rn "essentiel\|premium" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

Fix any remaining references.

- [ ] **Step 3: Final verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

ALL must pass.

---

## Summary

| Task | Description            | Files | Effort |
| ---- | ---------------------- | ----- | ------ |
| 1    | Types + Stripe config  | 2     | ~30min |
| 2    | Plan features/limits   | 1     | ~30min |
| 3    | Checkout + webhooks    | 3     | ~1h    |
| 4    | Billing portal         | 1     | ~20min |
| 5    | Frozen mode            | 3     | ~45min |
| 6    | Grace period + banners | 2     | ~30min |
| 7    | SubscriptionManager UI | 1     | ~1h    |
| 8    | Pricing page           | 1     | ~30min |
| 9    | i18n + cleanup         | 3+    | ~30min |

**Total: ~6h**
