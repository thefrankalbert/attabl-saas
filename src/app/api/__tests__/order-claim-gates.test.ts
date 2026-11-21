import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/tenant-lock-response', () => ({
  tenantLockResponse: vi.fn(async () => null),
}));

/**
 * X12: la prise en charge d'une commande (claim) verifiait une liste de roles
 * qui oubliait `admin` et ignorait les reglages du proprietaire. Elle suit
 * desormais la meme regle que l'action serveur equivalente.
 */

vi.mock('@/lib/rate-limit', () => ({
  assignmentLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/api-route-context', () => ({
  runApiRoute: (_req: Request, fn: () => unknown) => fn(),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-tenant-slug': 'resto' })),
}));
vi.mock('@/lib/auth/tenant-header', () => ({
  readTenantSlug: () => ({ slug: 'resto' }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockResolve = vi.fn();
vi.mock('@/lib/auth/resolve-admin-permission', () => ({
  resolveAdminPermission: (...a: unknown[]) => mockResolve(...a),
}));

const mockClaim = vi.fn();
vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: vi.fn(() => ({
    claimOrder: mockClaim,
  })),
}));

function chain(row: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => ({ data: row, error: null }));
  c.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) =>
      chain(table === 'tenants' ? { id: 'tenant-1' } : { id: 'admin-1', role: 'waiter' }),
  })),
}));

import { POST as CLAIM } from '../orders/[id]/claim/route';

const ORDER_ID = '550e8400-e29b-41d4-a716-446655440003';

function claimRequest() {
  return new Request(`http://localhost/api/orders/${ORDER_ID}/claim`, { method: 'POST' });
}
const params = { params: Promise.resolve({ id: ORDER_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockClaim.mockResolvedValue(undefined);
});

describe('POST /api/orders/[id]/claim', () => {
  it('suit orders.manage: refuse sans', async () => {
    mockResolve.mockResolvedValue({ allowed: false, role: 'waiter' });
    const res = await CLAIM(claimRequest(), params);
    expect(res.status).toBe(403);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('suit orders.manage: accepte avec (admin compris)', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'admin' });
    const res = await CLAIM(claimRequest(), params);
    expect(res.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), 'u-1', 'tenant-1', 'orders.manage');
  });
});
