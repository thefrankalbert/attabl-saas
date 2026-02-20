# TDD Vague 1 — CRITICAL Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ~120 tests covering all mission-critical business logic: pricing, coupons, plan enforcement, Stripe payments, orders, inventory, notifications, and authentication.

**Architecture:** Each task creates one test file using the existing mock Supabase injection pattern. Tests are pure unit tests with vi.mock() for external dependencies (Stripe, Supabase, rate-limit, logger). No integration tests.

**Tech Stack:** Vitest, TypeScript 5 strict, vi.mock/vi.fn, Zod schemas

**Worktree:** Main branch (tests don't need isolation)
**CI:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`

---

## Task 1: Pricing — tax.ts tests (10 tests)

**Files:**

- Create: `src/lib/pricing/__tests__/tax.test.ts`
- Reference: `src/lib/pricing/tax.ts`

**Tests to write:**

```typescript
// src/lib/pricing/__tests__/tax.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTax, calculateServiceCharge, calculateOrderTotal, validateTotal } from '../tax';

describe('calculateTax', () => {
  it('returns 0 when tax is disabled', () => {
    expect(calculateTax(10000, { enable_tax: false, tax_rate: 18 })).toBe(0);
  });

  it('returns 0 when tax_rate is 0', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: 0 })).toBe(0);
  });

  it('returns 0 when tax_rate is negative', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: -5 })).toBe(0);
  });

  it('calculates 18% tax correctly', () => {
    expect(calculateTax(10000, { enable_tax: true, tax_rate: 18 })).toBe(1800);
  });

  it('rounds to 2 decimal places', () => {
    // 33.33 * 7 / 100 = 2.3331 → should round to 2.33
    expect(calculateTax(33.33, { enable_tax: true, tax_rate: 7 })).toBe(2.33);
  });
});

describe('calculateServiceCharge', () => {
  it('returns 0 when service charge is disabled', () => {
    expect(
      calculateServiceCharge(10000, { enable_service_charge: false, service_charge_rate: 10 }),
    ).toBe(0);
  });

  it('calculates 10% service charge correctly', () => {
    expect(
      calculateServiceCharge(10000, { enable_service_charge: true, service_charge_rate: 10 }),
    ).toBe(1000);
  });
});

describe('calculateOrderTotal', () => {
  it('calculates full breakdown with tax + service charge', () => {
    const result = calculateOrderTotal(10000, {
      enable_tax: true,
      tax_rate: 18,
      enable_service_charge: true,
      service_charge_rate: 10,
    });
    expect(result).toEqual({
      subtotal: 10000,
      taxAmount: 1800,
      serviceChargeAmount: 1000,
      discountAmount: 0,
      total: 12800,
    });
  });

  it('applies discount and ensures total >= 0', () => {
    const result = calculateOrderTotal(
      100,
      {
        enable_tax: false,
        enable_service_charge: false,
      },
      200,
    ); // discount > subtotal
    expect(result.total).toBe(0);
  });

  it('defaults discountAmount to 0', () => {
    const result = calculateOrderTotal(500, { enable_tax: false });
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(500);
  });
});

describe('validateTotal', () => {
  it('validates exact match', () => {
    expect(validateTotal(1000, 1000)).toBe(true);
  });

  it('allows 1% tolerance', () => {
    expect(validateTotal(1005, 1000)).toBe(true);
  });

  it('rejects beyond tolerance', () => {
    expect(validateTotal(1020, 1000)).toBe(false);
  });

  it('handles zero totals', () => {
    expect(validateTotal(0, 0)).toBe(true);
    expect(validateTotal(1, 0)).toBe(false);
  });
});
```

**Run:** `pnpm test src/lib/pricing/__tests__/tax.test.ts`
**Expected:** 10 tests pass

**Commit:** `git commit -m "test: add pricing/tax.ts unit tests (10 tests)"`

---

## Task 2: Coupon Service tests (12 tests)

**Files:**

- Create: `src/services/__tests__/coupon.service.test.ts`
- Reference: `src/services/coupon.service.ts`
- Mock pattern: `src/services/__tests__/order.service.test.ts`

**Tests to write:**

```typescript
// src/services/__tests__/coupon.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCouponService } from '../coupon.service';
import type { SupabaseClient } from '@supabase/supabase-js';

// Reuse mock pattern from order.service.test.ts
function createMockSupabase() {
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  function getChain(table: string) {
    if (!chains[table]) {
      chains[table] = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return chains[table];
  }

  const mock = {
    from: vi.fn((table: string) => getChain(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _getChain: getChain,
  };

  return mock;
}

const asSupabase = (mock: ReturnType<typeof createMockSupabase>) =>
  mock as unknown as SupabaseClient;

const validCoupon = {
  id: 'coupon-1',
  tenant_id: 'tenant-1',
  code: 'SAVE10',
  discount_type: 'percentage' as const,
  discount_value: 10,
  min_order_amount: null,
  max_discount_amount: null,
  valid_from: null,
  valid_until: null,
  max_uses: null,
  current_uses: 0,
  is_active: true,
};

describe('couponService.validateCoupon', () => {
  it('returns valid result for a valid percentage coupon', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: validCoupon,
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('save10', 'tenant-1', 1000);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(100); // 10% of 1000
  });

  it('returns invalid when coupon not found', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('INVALID', 'tenant-1', 1000);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when coupon expired', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, valid_until: '2020-01-01T00:00:00Z' },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when max_uses reached', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, max_uses: 5, current_uses: 5 },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.valid).toBe(false);
  });

  it('returns invalid when order below min_order_amount', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, min_order_amount: 2000 },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.valid).toBe(false);
  });

  it('caps percentage discount at max_discount_amount', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, discount_value: 50, max_discount_amount: 200 },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.discountAmount).toBe(200); // capped, not 500
  });

  it('calculates fixed discount correctly', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, discount_type: 'fixed', discount_value: 300 },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.discountAmount).toBe(300);
  });

  it('caps fixed discount at subtotal', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: { ...validCoupon, discount_type: 'fixed', discount_value: 2000 },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.validateCoupon('SAVE10', 'tenant-1', 1000);
    expect(result.discountAmount).toBe(1000); // capped at subtotal
  });

  it('normalizes coupon code to uppercase and trims', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').maybeSingle.mockResolvedValue({
      data: validCoupon,
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    await service.validateCoupon('  save10  ', 'tenant-1', 1000);
    expect(supabase._getChain('coupons').eq).toHaveBeenCalledWith('code', 'SAVE10');
  });
});

describe('couponService.createCoupon', () => {
  it('creates coupon successfully', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').single.mockResolvedValue({
      data: { id: 'new-coupon', code: 'NEW20' },
      error: null,
    });
    const service = createCouponService(asSupabase(supabase));
    const result = await service.createCoupon('tenant-1', {
      code: 'new20',
      discount_type: 'percentage',
      discount_value: 20,
    });
    expect(result.code).toBe('NEW20');
  });

  it('throws CONFLICT on duplicate code', async () => {
    const supabase = createMockSupabase();
    supabase._getChain('coupons').single.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    const service = createCouponService(asSupabase(supabase));
    await expect(
      service.createCoupon('tenant-1', {
        code: 'DUP',
        discount_type: 'fixed',
        discount_value: 10,
      }),
    ).rejects.toThrow('existe déjà');
  });
});

describe('couponService.incrementUsage', () => {
  it('calls RPC increment_coupon_usage', async () => {
    const supabase = createMockSupabase();
    const service = createCouponService(asSupabase(supabase));
    await service.incrementUsage('coupon-1');
    expect(supabase.rpc).toHaveBeenCalledWith('increment_coupon_usage', { coupon_id: 'coupon-1' });
  });
});
```

**Run:** `pnpm test src/services/__tests__/coupon.service.test.ts`
**Commit:** `git commit -m "test: add coupon.service unit tests (12 tests)"`

---

## Task 3: Plan Enforcement Service tests (10 tests)

**Files:**

- Create: `src/services/__tests__/plan-enforcement.service.test.ts`
- Reference: `src/services/plan-enforcement.service.ts`

**Tests to write:** canAddAdmin (limit reached, under limit, trial gets premium limits), canAddMenuItem, canAddVenue, canAddMenu (same pattern), getUsageCounts (returns counts, handles null).

**Commit:** `git commit -m "test: add plan-enforcement.service unit tests (10 tests)"`

---

## Task 4: Inventory Service tests (14 tests)

**Files:**

- Create: `src/services/__tests__/inventory.service.test.ts`
- Reference: `src/services/inventory.service.ts`

**Tests to write:** getIngredients (returns list, handles error), createIngredient (defaults, success), updateIngredient, getRecipesForItem (with joins), setRecipe (delete+insert), destockOrder (RPC call), adjustStock (RPC + movement record), setOpeningStock, getStockStatus, getStockMovements (with filters).

**Commit:** `git commit -m "test: add inventory.service unit tests (14 tests)"`

---

## Task 5: Notification Service tests (8 tests)

**Files:**

- Create: `src/services/__tests__/notification.service.test.ts`
- Reference: `src/services/notification.service.ts`

**Mocking strategy:** vi.mock('@/lib/supabase/admin') and vi.mock('@/services/email.service')

**Tests to write:** checkAndNotifyLowStock — returns early when no low stock, filters already-notified ingredients (1hr rate limit), sends email with correct recipients, records notifications, returns gracefully when no admin users, handles email send failure.

**Commit:** `git commit -m "test: add notification.service unit tests (8 tests)"`

---

## Task 6: Stripe Webhook tests (12 tests)

**Files:**

- Create: `src/app/api/webhooks/__tests__/stripe.test.ts`
- Reference: `src/app/api/webhooks/stripe/route.ts`

**Mocking strategy:** vi.mock('stripe'), vi.mock('@/lib/supabase/admin'), vi.mock('next/headers'), vi.mock('@/lib/logger')

**Tests to write:** mapStripeStatus (trialing→trial, active→active, canceled→cancelled, past_due→past_due, unpaid→past_due, unknown→active), checkout.session.completed (updates tenant with plan+billing), customer.subscription.updated (maps status+periods), customer.subscription.deleted (suspends tenant), invoice.payment_failed (marks past_due), invalid signature (400), missing tenant (warns+continues).

**Commit:** `git commit -m "test: add Stripe webhook unit tests (12 tests)"`

---

## Task 7: Checkout Session Route tests (8 tests)

**Files:**

- Create: `src/app/api/__tests__/create-checkout-session.test.ts`
- Reference: `src/app/api/create-checkout-session/route.ts`

**Mocking strategy:** vi.mock('@/lib/rate-limit'), vi.mock('@/lib/supabase/server'), vi.mock('@/lib/stripe/server'), vi.mock('@/lib/logger')

**Tests to write:** rate limited (429), unauthenticated (401), no tenant (404), invalid body (400), invalid plan (400), successful session creation (returns sessionId+url), Stripe error (500), malformed JSON (400).

**Commit:** `git commit -m "test: add create-checkout-session route tests (8 tests)"`

---

## Task 8: Verify Checkout Route tests (8 tests)

**Files:**

- Create: `src/app/api/__tests__/verify-checkout.test.ts`
- Reference: `src/app/api/verify-checkout/route.ts`

**Tests to write:** rate limited (429), missing session_id (400), unauthenticated (401), session not found (404), user doesn't own tenant (403), missing tenant_id in session (400), tenant not found (404), successful verification (returns slug+status).

**Commit:** `git commit -m "test: add verify-checkout route tests (8 tests)"`

---

## Task 9: Orders Route tests (12 tests)

**Files:**

- Create: `src/app/api/__tests__/orders.test.ts`
- Reference: `src/app/api/orders/route.ts`

**Mocking strategy:** vi.mock all services (order, coupon, inventory, notification), vi.mock rate-limit, vi.mock supabase/server, vi.mock next/headers

**Tests to write:** rate limited (429), missing tenant slug (400), malformed JSON (400), Zod validation failure (400), tenant not found (via ServiceError NOT_FOUND → 404), invalid coupon (400), successful order with pricing breakdown, coupon usage incremented after success, ServiceError mapped to correct HTTP status, unknown error (500).

**Commit:** `git commit -m "test: add orders route unit tests (12 tests)"`

---

## Task 10: Signup Route tests (8 tests)

**Files:**

- Create: `src/app/api/__tests__/signup.test.ts`
- Reference: `src/app/api/signup/route.ts`

**Mocking strategy:** vi.mock('@/lib/rate-limit'), vi.mock('@/lib/supabase/admin'), vi.mock('@/services/signup.service'), vi.mock('@/lib/logger')

**Tests to write:** rate limited (429), malformed JSON (400), Zod validation failure (400), ServiceError maps to correct status, successful signup (returns slug+tenantId), unknown error (500), short password rejected, invalid email rejected.

**Commit:** `git commit -m "test: add signup route unit tests (8 tests)"`

---

## Task 11: OAuth Signup Route tests (10 tests)

**Files:**

- Create: `src/app/api/__tests__/signup-oauth.test.ts`
- Reference: `src/app/api/signup-oauth/route.ts`

**Tests to write:** rate limited (429), malformed JSON (400), Zod validation (400), unauthenticated (401), IDOR prevention — userId mismatch (403), successful OAuth signup, ServiceError mapping, unknown error (500), missing restaurantName (400), valid phone optional.

**Commit:** `git commit -m "test: add signup-oauth route unit tests (10 tests)"`

---

## Final: Run full CI pipeline

**Run:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
**Expected:** All 5 gates pass, ~320+ total tests (201 existing + ~120 new)
