import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * X12: POST /api/assignments ne verifiait que l'appartenance au restaurant, et
 * la prise en charge d'une commande (claim) une liste de roles qui oubliait
 * `admin` et ignorait les reglages du proprietaire. Les deux suivent desormais
 * la meme regle que les actions serveur equivalentes.
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

const mockAssign = vi.fn();
const mockClaim = vi.fn();
vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: vi.fn(() => ({
    assignServerToTable: mockAssign,
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

import { POST as ASSIGN } from '../assignments/route';
import { POST as CLAIM } from '../orders/[id]/claim/route';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440003';

function assignRequest() {
  return new Request('http://localhost/api/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: TABLE_ID, server_id: SERVER_ID }),
  });
}
function claimRequest() {
  return new Request(`http://localhost/api/orders/${ORDER_ID}/claim`, { method: 'POST' });
}
const params = { params: Promise.resolve({ id: ORDER_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockAssign.mockResolvedValue({ id: 'a-1' });
  mockClaim.mockResolvedValue(undefined);
});

describe('POST /api/assignments', () => {
  it('refuse un serveur, meme avec orders.manage (gestion de salle = gerant)', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'waiter' });
    const res = await ASSIGN(assignRequest());
    expect(res.status).toBe(403);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('refuse un gerant a qui on a retire orders.manage', async () => {
    mockResolve.mockResolvedValue({ allowed: false, role: 'manager' });
    const res = await ASSIGN(assignRequest());
    expect(res.status).toBe(403);
  });

  it('laisse un gerant assigner', async () => {
    mockResolve.mockResolvedValue({ allowed: true, role: 'manager' });
    const res = await ASSIGN(assignRequest());
    expect(res.status).toBe(201);
    expect(mockAssign).toHaveBeenCalledWith('tenant-1', TABLE_ID, SERVER_ID);
  });
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
