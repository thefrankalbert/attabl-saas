import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

class MockAuthError extends Error {
  status: number;
  constructor(status: number) {
    super('auth');
    this.status = status;
  }
}
const mockGetAuthUserForTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthUserForTenant(...args),
  AuthError: MockAuthError,
}));

const mockRecordLoss = vi.fn<() => Promise<void>>();
const mockGetLossesByReason = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({
    recordLoss: mockRecordLoss,
    getLossesByReason: mockGetLossesByReason,
  })),
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const INGREDIENT_ID = '33333333-3333-4333-a333-333333333333';

const validInput = {
  ingredient_id: INGREDIENT_ID,
  quantity: 3,
  reason_code: 'breakage' as const,
  notes: 'dropped',
};

describe('actionRecordLoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({ supabase: {}, user: { id: 'user-9' } });
    mockRecordLoss.mockResolvedValue(undefined);
  });

  it('rejects an invalid reason_code before touching the service', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, {
      ...validInput,
      // @ts-expect-error - deliberately invalid reason for the negative test
      reason_code: 'recount',
    });

    expect(result).toEqual({ error: 'Invalid input' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, { ...validInput, quantity: 0 });

    expect(result).toEqual({ error: 'Invalid input' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid ingredient_id', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, {
      ...validInput,
      ingredient_id: 'not-a-uuid',
    });

    expect(result).toEqual({ error: 'Invalid input' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('returns a permission error when the caller lacks inventory access', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError(403));

    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ error: 'Permissions insuffisantes' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('records the loss on the happy path', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ success: true });
    expect(mockRecordLoss).toHaveBeenCalledWith(TENANT_ID, validInput);
  });

  it('WRITE stays gated at inventory.edit with the write role list', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    await actionRecordLoss(TENANT_ID, validInput);

    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ['owner', 'admin', 'manager'],
      'inventory.edit',
    );
  });
});

describe('actionGetLossesByReason (READ gated at inventory.view)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({ supabase: {}, user: { id: 'user-9' } });
    mockGetLossesByReason.mockResolvedValue([]);
  });

  it('gates on inventory.view with a view-inclusive role list (chef can read)', async () => {
    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID);

    expect(result).toEqual({ success: true, data: [] });
    // The coarse role list must include view-only roles (chef, cashier, waiter)
    // and the fine permission must be the READ code, mirroring the page.
    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'],
      'inventory.view',
    );
  });

  it('returns the report rows on success', async () => {
    const rows = [{ reason_code: 'breakage', nb_movements: 1, total_qty: 2, total_cost_value: 50 }];
    mockGetLossesByReason.mockResolvedValue(rows);

    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(result).toEqual({ success: true, data: rows });
    expect(mockGetLossesByReason).toHaveBeenCalledWith(TENANT_ID, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
  });

  it('returns a permission error when the caller lacks inventory.view', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError(403));

    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID);

    expect(result).toEqual({ error: 'Permissions insuffisantes' });
    expect(mockGetLossesByReason).not.toHaveBeenCalled();
  });
});
