import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/tenant-lock-response', () => ({
  tenantLockResponse: vi.fn(async () => null),
}));

/**
 * X12: la prise en charge d'une commande (claim) verifiait une liste de roles
 * qui oubliait `admin` et ignorait les reglages du proprietaire. Elle exige
 * desormais `orders.take` (geste de salle), resolu par le VRAI
 * resolveLiveMember sur un client simule: le chef est refuse, le serveur passe.
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

/** Postes du membre simule, modifie par chaque test. */
let memberPostes: string[] | null = ['waiter'];

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
  // Reglages du restaurant par poste (poste_permissions): aucun.
  c.in = vi.fn(async () => ({ data: [], error: null }));
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) =>
      chain(
        table === 'tenants'
          ? { id: 'tenant-1' }
          : memberPostes
            ? {
                id: 'admin-1',
                postes: memberPostes,
                permission_overrides: null,
                is_super_admin: false,
                role: 'staff',
              }
            : null,
      ),
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
  memberPostes = ['waiter'];
  mockClaim.mockResolvedValue(undefined);
});

describe('POST /api/orders/[id]/claim', () => {
  it.each([
    ['chef', ['chef']],
    ['cuisinier', ['cook']],
    ['aucune ligne de membre', null],
  ])('exige orders.take: refuse %s, rien n est pris en charge', async (_label, postes) => {
    memberPostes = postes;
    const res = await CLAIM(claimRequest(), params);
    expect(res.status).toBe(403);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it.each([
    ['serveur', ['waiter']],
    ['caissier', ['cashier']],
    ['gerant', ['manager']],
    ['proprietaire', ['owner']],
  ])('exige orders.take: accepte %s', async (_label, postes) => {
    memberPostes = postes;
    const res = await CLAIM(claimRequest(), params);
    expect(res.status).toBe(200);
    // La commande est prise au nom de la ligne de membre, pas du compte auth.
    expect(mockClaim).toHaveBeenCalledWith(ORDER_ID, 'admin-1', 'tenant-1');
  });
});
