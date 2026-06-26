import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

const { mockGetUser, mockFrom, mockHeaderGet } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockHeaderGet: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser }, from: mockFrom })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeaderGet })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getAuthenticatedUserWithTenant } from '../get-session';

// ---------------------------------------------------------------------------
// Helpers - a tiny chainable supabase query stub whose terminal maybeSingle()
// resolves to a queued result keyed by table.
// ---------------------------------------------------------------------------

function chain(result: { data: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}

const USER = { id: 'auth-user-1', email: 'owner@test.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('getAuthenticatedUserWithTenant - tenant scoping', () => {
  it('scopes to the x-tenant-slug tenant for a multi-tenant owner (not the oldest)', async () => {
    mockHeaderGet.mockReturnValue('tenant-b-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-B' } });
      // admin_users scoped lookup for tenant-B
      return chain({ data: { id: 'membership-B', tenant_id: 'tenant-B', role: 'owner' } });
    });

    const res = await getAuthenticatedUserWithTenant();

    expect(res.tenantId).toBe('tenant-B');
    expect(res.adminUserId).toBe('membership-B');
    expect(res.role).toBe('owner');
  });

  it('falls back to the oldest membership when no x-tenant-slug header is present', async () => {
    mockHeaderGet.mockReturnValue(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: null });
      // oldest-membership fallback
      return chain({ data: { id: 'membership-A', tenant_id: 'tenant-A', role: 'admin' } });
    });

    const res = await getAuthenticatedUserWithTenant();

    expect(res.tenantId).toBe('tenant-A');
    expect(res.adminUserId).toBe('membership-A');
  });

  it('falls back to oldest membership when the header tenant exists but the user is not a member', async () => {
    mockHeaderGet.mockReturnValue('foreign-tenant');
    let adminUsersCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-foreign' } });
      adminUsersCall += 1;
      // first admin_users call = scoped lookup (not a member -> null)
      // second admin_users call = oldest-membership fallback
      return adminUsersCall === 1
        ? chain({ data: null })
        : chain({ data: { id: 'membership-A', tenant_id: 'tenant-A', role: 'admin' } });
    });

    const res = await getAuthenticatedUserWithTenant();

    // Never elevates into the foreign tenant; uses the user's own oldest membership.
    expect(res.tenantId).toBe('tenant-A');
    expect(res.adminUserId).toBe('membership-A');
  });
});
