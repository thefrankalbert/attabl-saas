import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canAccessFeature } from '@/lib/plans/features';
import * as Sentry from '@sentry/nextjs';

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Authenticated supabase client used for the tenant plan lookup.
function makeChain(resolved: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  return chain;
}
const mockAuthedSupabase = {
  from: vi.fn(() =>
    makeChain({
      data: {
        subscription_plan: 'business',
        subscription_status: 'active',
        trial_ends_at: null,
      },
    }),
  ),
};

class MockAuthError extends Error {}
const mockGetAuthUserForTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthUserForTenant(...args),
  AuthError: MockAuthError,
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));

const mockCancelOrder = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    cancelOrder: mockCancelOrder,
    updateStatus: mockUpdateStatus,
  })),
}));

const mockRestockOrder = vi.fn<() => Promise<number>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({ restockOrder: mockRestockOrder })),
}));

// Imported by the action module but unused on this path.
vi.mock('@/services/audit.service', () => ({ createAuditService: vi.fn() }));
vi.mock('@/services/payment.service', () => ({ createPaymentService: vi.fn() }));

vi.mock('@/lib/plans/features', () => ({ canAccessFeature: vi.fn(() => false) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';

describe('actionUpdateOrderStatus - cancel auto-restock wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: mockAuthedSupabase,
      user: { id: 'user-9' },
    });
    mockAuthedSupabase.from.mockReturnValue(
      makeChain({
        data: {
          subscription_plan: 'business',
          subscription_status: 'active',
          trial_ends_at: null,
        },
      }),
    );
    mockCancelOrder.mockResolvedValue(undefined);
    mockUpdateStatus.mockResolvedValue(undefined);
  });

  it('restocks after cancel when the plan grants inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockRestockOrder.mockResolvedValue(1);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    expect(result.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID);
    await vi.waitFor(() => {
      expect(mockRestockOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'user-9');
    });
  });

  it('does NOT restock when the plan lacks inventory', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(false);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    expect(result.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalledWith(ORDER_ID, TENANT_ID);
    expect(mockRestockOrder).not.toHaveBeenCalled();
  });

  it('does NOT restock for a non-cancel status change', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'ready');

    expect(result.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'ready');
    expect(mockCancelOrder).not.toHaveBeenCalled();
    expect(mockRestockOrder).not.toHaveBeenCalled();
  });

  it('keeps cancel successful and reports to Sentry when restock fails', async () => {
    vi.mocked(canAccessFeature).mockReturnValue(true);
    mockRestockOrder.mockRejectedValue(new Error('restock RPC boom'));

    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const result = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');

    // Non-blocking: cancel still succeeds even if restock throws.
    expect(result.success).toBe(true);
    await vi.waitFor(() => {
      expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { area: 'inventory-restock' } }),
      );
    });
  });
});
