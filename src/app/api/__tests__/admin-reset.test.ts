import { describe, it, expect, vi, beforeEach } from 'vitest';

// /api/admin/reset efface les commandes, payees comprises, avec l'historique
// des paiements. Decision du 2026-11-09: seul le proprietaire touche a
// l'historique de l'argent. Un admin passait, sans permission fine a lui
// retirer.

const { mockAuth, mockRpc } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({
  adminResetLimiter: { check: vi.fn(() => Promise.resolve({ success: true })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mockRpc }) }));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: () => mockAuth(),
  AuthError: class AuthError extends Error {},
}));

import { POST } from '@/app/api/admin/reset/route';

function resetRequest(): Request {
  return new Request('http://localhost/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetType: 'orders', confirmationText: 'CONFIRMER SUPPRESSION' }),
  });
}

function as(role: string): void {
  mockAuth.mockResolvedValue({ tenantId: 'tenant-1', user: { id: 'user-1' }, role });
}

describe('POST /api/admin/reset - reserve au proprietaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: { orders_deleted: 3 }, error: null });
  });

  it.each(['admin', 'manager', 'cashier', 'chef', 'waiter'])('refuse le role %s', async (role) => {
    as(role);
    const res = await POST(resetRequest());
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('laisse le proprietaire reinitialiser son restaurant', async () => {
    as('owner');
    const res = await POST(resetRequest());
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('reset_tenant_data', {
      p_tenant_id: 'tenant-1',
      p_reset_type: 'orders',
    });
  });
});
