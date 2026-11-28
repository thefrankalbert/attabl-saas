import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ORDERS_ADVANCE } from '@/lib/admin-roles';

// "Liberer la table": tenant from the session, floor permission, service-role
// write; refusal surfaced to the staff.

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const mockAuth = vi.fn();
class MockAuthError extends Error {}
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: (...a: unknown[]) => mockAuth(...a),
  AuthError: MockAuthError,
}));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({ assertTenantServing: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
const mockRelease = vi.fn();
const mockReleaseStale = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    releaseTableSession: mockRelease,
    releaseStaleSessions: mockReleaseStale,
  })),
}));

describe('actionReleaseTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ tenantId: 'tenant-from-session' });
  });

  it('requires ORDERS_ADVANCE and uses the tenant of the session', async () => {
    const { actionReleaseTable } = await import('../table-release');
    const res = await actionReleaseTable('5', 'Salle 5');

    expect(mockAuth).toHaveBeenCalledWith(ORDERS_ADVANCE);
    expect(mockRelease).toHaveBeenCalledWith('tenant-from-session', '5', 'Salle 5');
    expect(res).toEqual({ success: true });
  });

  it('returns the refusal (money still due) instead of claiming success', async () => {
    const { ServiceError } = await import('@/services/errors');
    mockRelease.mockRejectedValue(new ServiceError('Encaissez d abord', 'CONFLICT'));
    const { actionReleaseTable } = await import('../table-release');

    expect(await actionReleaseTable('5')).toEqual({ success: false, error: 'Encaissez d abord' });
  });

  it('rejects an empty table number without touching anything (witness)', async () => {
    const { actionReleaseTable } = await import('../table-release');
    expect((await actionReleaseTable('')).success).toBe(false);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});
