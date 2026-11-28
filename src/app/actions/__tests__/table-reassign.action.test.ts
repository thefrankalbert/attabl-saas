import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing } = vi.hoisted(() => ({ mockAssertServing: vi.fn() }));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

// --- Mocks --------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

class MockAuthError extends Error {}
const mockGetAuthUserWithTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: (...args: unknown[]) => mockGetAuthUserWithTenant(...args),
  AuthError: MockAuthError,
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';

const mockRpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUserWithTenant.mockResolvedValue({
    tenantId: TENANT_ID,
    supabase: { rpc: mockRpc },
  });
  mockRpc.mockResolvedValue({ error: null });
});

describe('actionReassignOrderTable', () => {
  it('calls the RPC with the derived tenant and validated args', async () => {
    const { actionReassignOrderTable } = await import('@/app/actions/table-reassign');
    const result = await actionReassignOrderTable(ORDER_ID, 'T12');

    expect(result).toEqual({ success: true });
    // tenant is derived from the session, gated on orders.take.
    expect(mockGetAuthUserWithTenant).toHaveBeenCalledWith('orders.take');
    expect(mockRpc).toHaveBeenCalledWith('reassign_order_table', {
      p_order_id: ORDER_ID,
      p_tenant_id: TENANT_ID,
      p_new_table_number: 'T12',
    });
  });

  it('rejects a non-uuid orderId via Zod before touching auth or the RPC', async () => {
    const { actionReassignOrderTable } = await import('@/app/actions/table-reassign');
    const result = await actionReassignOrderTable('not-a-uuid', 'T12');

    expect(result).toEqual({ success: false, error: 'Donnees invalides' });
    expect(mockGetAuthUserWithTenant).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the error message when permission is denied (AuthError)', async () => {
    mockGetAuthUserWithTenant.mockRejectedValue(new MockAuthError('Permissions insuffisantes'));

    const { actionReassignOrderTable } = await import('@/app/actions/table-reassign');
    const result = await actionReassignOrderTable(ORDER_ID, 'T12');

    expect(result).toEqual({ success: false, error: 'Permissions insuffisantes' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns { success: false } when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Order not found' } });

    const { actionReassignOrderTable } = await import('@/app/actions/table-reassign');
    const result = await actionReassignOrderTable(ORDER_ID, 'T12');

    expect(result).toEqual({ success: false, error: 'Commande introuvable.' });
  });

  it.each([
    ['Destination table is now occupied', undefined, "Cette table vient d'etre occupee"],
    // B133: destination absente des tables du restaurant.
    ['Destination table not found', 'P0002', "Cette table n'existe pas dans votre restaurant"],
    ['permission denied', '42501', 'Votre role ne permet pas'],
    [
      'duplicate key value violates unique constraint "x_pkey"',
      '23505',
      'Le changement de table a echoue',
    ],
  ])(
    'message brut "%s" traduit en francais, sans detail interne',
    async (message, code, attendu) => {
      mockRpc.mockResolvedValue({ error: { message, code } });
      const { actionReassignOrderTable } = await import('@/app/actions/table-reassign');
      const result = await actionReassignOrderTable(ORDER_ID, 'T12');
      expect(result.success).toBe(false);
      const err = (result as { error: string }).error;
      expect(err).toContain(attendu);
      expect(err).not.toContain(message);
    },
  );
});
