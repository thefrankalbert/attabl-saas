import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import type { CouponValidationResult } from '@/services/coupon.service';
import type { PricingBreakdown } from '@/types/admin.types';

// ─── Mock external dependencies ────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// ─── Rate-limit mock ───────────────────────────────────────────
const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();

vi.mock('@/lib/rate-limit', () => ({
  orderLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...(args as [])) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// ─── Order service mock ────────────────────────────────────────
const mockValidateTenant = vi.fn<() => Promise<{ id: string }>>();
const mockValidateOrderItems = vi.fn<
  () => Promise<{
    validatedTotal: number;
    verifiedPrices: Map<string, number>;
    categoryIds: string[];
    itemCategoryMap: Map<string, string>;
  }>
>();
const mockCreateOrderWithItems =
  vi.fn<() => Promise<{ orderId: string; orderNumber: string; total: number }>>();
const mockDeterminePreparationZone = vi.fn<
  () => Promise<{
    orderZone: string;
    categoryZoneMap: Map<string, string>;
  }>
>();

vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    validateTenant: mockValidateTenant,
    validateOrderItems: mockValidateOrderItems,
    createOrderWithItems: mockCreateOrderWithItems,
    determinePreparationZone: mockDeterminePreparationZone,
  })),
}));

// ─── Coupon service mock ───────────────────────────────────────
const mockValidateCoupon =
  vi.fn<(code: string, tenantId: string, subtotal: number) => Promise<CouponValidationResult>>();
const mockClaimUsage = vi.fn<(couponId: string) => Promise<boolean>>();

vi.mock('@/services/coupon.service', () => ({
  createCouponService: vi.fn(() => ({
    validateCoupon: mockValidateCoupon,
    claimUsage: mockClaimUsage,
  })),
}));

// ─── Inventory service mock ────────────────────────────────────
const mockDestockOrder = vi.fn<() => Promise<number>>();

vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({
    destockOrder: mockDestockOrder,
  })),
}));

// ─── Notification service mock ─────────────────────────────────
vi.mock('@/services/notification.service', () => ({
  checkAndNotifyLowStock: vi.fn().mockResolvedValue(undefined),
}));

// ─── Pricing mock ──────────────────────────────────────────────
const mockCalculateOrderTotal =
  vi.fn<(subtotal: number, config: unknown, discount: number) => PricingBreakdown>();

vi.mock('@/lib/pricing/tax', () => ({
  calculateOrderTotal: (...args: unknown[]) =>
    mockCalculateOrderTotal(args[0] as number, args[1], args[2] as number),
}));

// ─── Plan features mock ───────────────────────────────────────
vi.mock('@/lib/plans/features', () => ({
  canAccessFeature: vi.fn(() => false),
}));

// ─── Supabase query builder mock (for tenant config fetch via admin client) ────
const mockSupabaseSingle = vi.fn();
const mockSupabaseEq = vi.fn(() => ({ single: mockSupabaseSingle }));
const mockSupabaseSelect = vi.fn(() => ({ eq: mockSupabaseEq }));

vi.mock('@/lib/supabase/server', async () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        select: mockSupabaseSelect,
      })),
    }),
  ),
}));

const mockNotificationInsert = vi.fn(() => ({
  then: vi.fn((cb: (result: { error: null }) => void) => {
    cb({ error: null });
    return { catch: vi.fn() };
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'notifications') {
        return { insert: mockNotificationInsert };
      }
      return { select: mockSupabaseSelect };
    }),
  })),
}));

// ─── Helpers ───────────────────────────────────────────────────

/** Build a valid order request body */
function validOrderBody() {
  return {
    items: [
      {
        id: '11111111-1111-4111-a111-111111111111',
        name: 'Pizza Margherita',
        price: 5000,
        quantity: 2,
      },
    ],
    tableNumber: '5',
    customerName: 'John',
    service_type: 'dine_in' as const,
  };
}

/** Create a mock Request with JSON body and optional headers */
function createMockRequest(body: unknown, headersInit?: Record<string, string>): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headersInit,
    },
    body: JSON.stringify(body),
  });
}

/** Create a mock Request that fails to parse as JSON */
function createBrokenJsonRequest(): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'NOT_JSON{{{',
  });
}

/** Extract JSON body and status from NextResponse */
async function parseResponse(
  response: NextResponse,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

// ─── Test Suite ────────────────────────────────────────────────

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: rate limit passes
    mockRateLimitCheck.mockResolvedValue({ success: true });

    // Default: headers return x-tenant-slug
    mockHeaders.mockResolvedValue(new Headers({ 'x-tenant-slug': 'test-restaurant' }));

    // Default: tenant validation succeeds
    mockValidateTenant.mockResolvedValue({ id: 'tenant-abc' });

    // Default: order items validation succeeds
    mockValidateOrderItems.mockResolvedValue({
      validatedTotal: 10000,
      verifiedPrices: new Map(),
      categoryIds: [],
      itemCategoryMap: new Map(),
    });
    mockDeterminePreparationZone.mockResolvedValue({
      orderZone: 'kitchen',
      categoryZoneMap: new Map(),
    });

    // Default: coupon validation (not used unless coupon_code provided)
    mockValidateCoupon.mockResolvedValue({
      valid: true,
      discountAmount: 0,
      coupon: undefined,
    });

    // Default: supabase tenant config fetch succeeds
    mockSupabaseSingle.mockResolvedValue({
      data: {
        currency: 'XAF',
        tax_rate: 0,
        service_charge_rate: 0,
        enable_tax: false,
        enable_service_charge: false,
        subscription_plan: 'starter',
        subscription_status: 'active',
        trial_ends_at: null,
      },
      error: null,
    });

    // Default: pricing calculation
    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      discountAmount: 0,
      total: 10000,
    });

    // Default: order creation succeeds
    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-123',
      orderNumber: 'CMD-20260220-001',
      total: 10000,
    });

    // Default: increment usage succeeds
    mockClaimUsage.mockResolvedValue(true);
  });

  // ── 1. Rate limited → 429 ──────────────────────────────────

  it('should return 429 when rate limited', async () => {
    mockRateLimitCheck.mockResolvedValue({ success: false });

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(429);
    expect(body.error).toBe('rateLimited');
  });

  // ── 2. Missing tenant slug → 400 ──────────────────────────

  it('should return 400 when x-tenant-slug header is missing', async () => {
    mockHeaders.mockResolvedValue(new Headers({}));

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('tenantNotIdentified');
  });

  // ── 3. Malformed JSON → 400 ────────────────────────────────

  it('should return 400 when request body is malformed JSON', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const request = createBrokenJsonRequest();
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('invalidRequestBody');
  });

  // ── 4. Zod validation failure → 400 ────────────────────────

  it('should return 400 with validation details when Zod schema rejects input', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest({
      items: [
        {
          id: 'not-a-uuid',
          name: '',
          price: -5,
          quantity: 0,
        },
      ],
    });
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('invalidOrderData');
    expect(Array.isArray(body.details)).toBe(true);
    expect((body.details as string[]).length).toBeGreaterThan(0);
  });

  // ── 5. Tenant not found (ServiceError NOT_FOUND) → 404 ────

  it('should return 404 when tenant is not found via ServiceError', async () => {
    mockValidateTenant.mockRejectedValue(new ServiceError('Restaurant non trouvé', 'NOT_FOUND'));

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(serviceErrorToStatus('NOT_FOUND'));
    expect(status).toBe(404);
    expect(body.error).toBe('Restaurant non trouvé');
  });

  // ── 6. Invalid coupon → 400 ────────────────────────────────

  it('should return 400 when coupon code is invalid', async () => {
    mockValidateCoupon.mockResolvedValue({
      valid: false,
      discountAmount: 0,
      error: 'Ce code a expiré',
    });

    const { POST } = await import('@/app/api/orders/route');
    const bodyWithCoupon = { ...validOrderBody(), coupon_code: 'EXPIRED10' };
    const request = createMockRequest(bodyWithCoupon);
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('Ce code a expiré');
  });

  // ── 7. Successful order with pricing breakdown ─────────────

  it('should return success with pricing breakdown on valid order', async () => {
    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 1800,
      serviceChargeAmount: 1000,
      discountAmount: 0,
      total: 12800,
    });

    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-456',
      orderNumber: 'CMD-20260220-002',
      total: 12800,
    });

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderId).toBe('order-456');
    expect(body.orderNumber).toBe('CMD-20260220-002');
    expect(body.total).toBe(12800);

    // Verify pricing was called with correct args
    expect(mockCalculateOrderTotal).toHaveBeenCalledWith(
      10000,
      expect.objectContaining({
        tax_rate: 0,
        service_charge_rate: 0,
      }),
      0,
    );
  });

  // ── 8. Coupon usage incremented after success ──────────────

  it('should increment coupon usage after successful order with coupon', async () => {
    mockValidateCoupon.mockResolvedValue({
      valid: true,
      discountAmount: 500,
      coupon: { id: 'coupon-xyz' } as CouponValidationResult['coupon'],
    });

    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      discountAmount: 500,
      total: 9500,
    });

    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-789',
      orderNumber: 'CMD-20260220-003',
      total: 9500,
    });

    const { POST } = await import('@/app/api/orders/route');
    const bodyWithCoupon = { ...validOrderBody(), coupon_code: 'SAVE10' };
    const request = createMockRequest(bodyWithCoupon);
    const response = await POST(request);
    const { status } = await parseResponse(response);

    expect(status).toBe(200);
    expect(mockClaimUsage).toHaveBeenCalledWith('coupon-xyz');
  });

  // ── 9. ServiceError mapped to correct HTTP status ──────────

  it('should map ServiceError CONFLICT to 409', async () => {
    mockValidateTenant.mockRejectedValue(new ServiceError('Conflit détecté', 'CONFLICT'));

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(409);
    expect(body.error).toBe('Conflit détecté');
  });

  // ── 10. Unknown error → 500 ────────────────────────────────

  it('should return 500 when an unexpected error is thrown', async () => {
    mockValidateTenant.mockRejectedValue(new Error('Database connection lost'));

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(500);
    expect(body.error).toBe('serverError');
  });

  // ── 11. Empty items array → 400 ────────────────────────────

  it('should return 400 when items array is empty', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest({ items: [] });
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('invalidOrderData');
    expect(Array.isArray(body.details)).toBe(true);
    expect((body.details as string[]).length).toBeGreaterThan(0);
  });

  // ── 12. Order items validation failure → 400 ──────────────

  it('should return 400 when order items validation throws VALIDATION error', async () => {
    mockValidateOrderItems.mockRejectedValue(
      new ServiceError('Certains articles ne sont plus valides', 'VALIDATION', [
        'Article "Ghost Item" non trouvé',
      ]),
    );

    const { POST } = await import('@/app/api/orders/route');
    const request = createMockRequest(validOrderBody());
    const response = await POST(request);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('Certains articles ne sont plus valides');
  });
});
