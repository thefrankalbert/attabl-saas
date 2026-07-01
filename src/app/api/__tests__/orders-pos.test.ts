import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextResponse } from 'next/server';
import { canAccessFeature } from '@/lib/plans/features';
import { checkAndNotifyLowStock } from '@/services/notification.service';
import * as Sentry from '@sentry/nextjs';

// ─── Mock external dependencies ────────────────────────────────
// after() runs its callback inline (quota check); NextResponse kept real.
vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      void cb();
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  orderLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...(args as [])) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/csrf', () => ({
  verifyOrigin: vi.fn(() => null),
}));

// Authenticated POS user + session-derived tenant (IDOR prevention).
class MockAuthError extends Error {}
const mockGetAuthUser = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: () => mockGetAuthUser(),
  AuthError: MockAuthError,
}));

// ─── Order service mock ────────────────────────────────────────
const mockFindByClientRequestId = vi.fn();
const mockValidateOrderItems = vi.fn();
const mockDeterminePreparationZone = vi.fn();
const mockCreateOrderWithItems = vi.fn();
const mockCloseSession = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    findOrderByClientRequestId: mockFindByClientRequestId,
    validateOrderItems: mockValidateOrderItems,
    determinePreparationZone: mockDeterminePreparationZone,
    createOrderWithItems: mockCreateOrderWithItems,
    closeSessionIfFullySettled: mockCloseSession,
  })),
}));

vi.mock('@/services/coupon.service', () => ({
  createCouponService: vi.fn(() => ({
    validateCoupon: vi.fn(),
    claimUsage: vi.fn(),
    unclaimUsage: vi.fn(),
    recordRedemption: vi.fn(),
  })),
}));

// Quota check runs in after(); keep it inert.
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({
    getMonthlyOrderUsage: vi.fn().mockResolvedValue({ count: 0, limit: null, exceeded: false }),
  })),
}));

const mockCalculateOrderTotal = vi.fn();
vi.mock('@/lib/pricing/tax', () => ({
  calculateOrderTotal: (...args: unknown[]) => mockCalculateOrderTotal(...args),
}));

// ─── Inventory service mock ────────────────────────────────────
const mockDestockOrder = vi.fn<() => Promise<number>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({ destockOrder: mockDestockOrder })),
}));

vi.mock('@/services/notification.service', () => ({
  checkAndNotifyLowStock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/plans/features', () => ({
  canAccessFeature: vi.fn(() => false),
}));

// ─── Menu items query mock ─────────────────────────────────────
const mockFetchMenuItems = vi.fn();
vi.mock('@/lib/menu-items-query', () => ({
  fetchMenuItemsByIds: (...args: unknown[]) => mockFetchMenuItems(...args),
}));

// ─── Admin Supabase client mock (chainable) ────────────────────
// admin_users -> single(); tenants -> single(); notifications -> insert() thenable.
const mockAdminUserRow = { data: { id: 'server-1', tenant_id: 'tenant-abc', role: 'cashier' } };
const mockTenantRow = {
  data: {
    currency: 'XAF',
    tax_rate: 0,
    service_charge_rate: 0,
    enable_tax: false,
    enable_service_charge: false,
    subscription_plan: 'business',
    subscription_status: 'active',
    trial_ends_at: null,
  },
  error: null,
};

function makeChain(resolved: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'admin_users') return makeChain(mockAdminUserRow);
      if (table === 'tenants') return makeChain(mockTenantRow);
      if (table === 'notifications') {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) };
      }
      return makeChain({ data: null, error: null });
    }),
  })),
}));

// ─── Helpers ───────────────────────────────────────────────────
const MENU_ITEM_ID = '11111111-1111-4111-a111-111111111111';

function validPosBody() {
  return {
    table_number: '5',
    status: 'pending' as const,
    service_type: 'dine_in' as const,
    items: [{ menu_item_id: MENU_ITEM_ID, quantity: 2 }],
  };
}

function createMockRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
}

async function parseResponse(
  response: NextResponse,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

// ─── Test Suite - POS auto-destock wiring ──────────────────────
describe('POST /api/orders/pos - auto-destock wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockGetAuthUser.mockResolvedValue({
      tenantId: 'tenant-abc',
      user: { id: 'user-1' },
      role: 'cashier',
    });
    mockFindByClientRequestId.mockResolvedValue(null);
    mockFetchMenuItems.mockResolvedValue({
      data: [
        {
          id: MENU_ITEM_ID,
          name: 'Pizza',
          name_en: null,
          price: 5000,
          is_available: true,
          category_id: 'cat-1',
        },
      ],
      error: null,
    });
    mockValidateOrderItems.mockResolvedValue({
      validatedTotal: 10000,
      verifiedPrices: new Map(),
      itemCategoryMap: new Map(),
    });
    mockDeterminePreparationZone.mockResolvedValue({
      orderZone: 'kitchen',
      categoryZoneMap: new Map(),
    });
    mockCalculateOrderTotal.mockReturnValue({
      subtotal: 10000,
      taxAmount: 0,
      serviceChargeAmount: 0,
      discountAmount: 0,
      total: 10000,
    });
    mockCreateOrderWithItems.mockResolvedValue({
      orderId: 'order-pos-1',
      orderNumber: 'POS-001',
      total: 10000,
      deduplicated: false,
    });
  });

  it('destocks the order when the plan grants inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockDestockOrder.mockResolvedValue(1);

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status } = await parseResponse(response);

    expect(status).toBe(200);
    await vi.waitFor(() => {
      expect(mockDestockOrder).toHaveBeenCalledWith('order-pos-1', 'tenant-abc');
      expect(vi.mocked(checkAndNotifyLowStock)).toHaveBeenCalledWith('tenant-abc');
    });
  });

  it('does NOT destock when the plan lacks inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(false);

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status } = await parseResponse(response);

    expect(status).toBe(200);
    expect(mockDestockOrder).not.toHaveBeenCalled();
  });

  it('keeps the order successful and reports to Sentry when destock fails', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockDestockOrder.mockRejectedValue(new Error('destock RPC boom'));

    const { POST } = await import('@/app/api/orders/pos/route');
    const response = await POST(createMockRequest(validPosBody()));
    const { status, body } = await parseResponse(response);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    await vi.waitFor(() => {
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { area: 'inventory-destock' } }),
      );
    });
  });
});
