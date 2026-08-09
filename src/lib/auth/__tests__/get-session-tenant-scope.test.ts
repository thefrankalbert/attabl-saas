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
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) c[m] = vi.fn(() => c);
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

  it('refuse quand le tenant du header existe mais que l utilisateur n en est pas membre', async () => {
    // SESSION-FALLBACK. Avant, on retombait ici sur l'appartenance la plus
    // ANCIENNE. Il n'y avait pas d'elevation cross-tenant, mais un deputy
    // confus: l'action partait EN SILENCE sur le mauvais etablissement. Un
    // super_admin ouvrant /sites/client-b/admin/settings et modifiant les taux
    // de TVA voyait sa modification atterrir sur SON tenant, sans erreur.
    mockHeaderGet.mockReturnValue('foreign-tenant');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-foreign' } });
      // Ni appartenance scopee, ni ligne super_admin vivante.
      return chain({ data: null });
    });

    await expect(getAuthenticatedUserWithTenant()).rejects.toMatchObject({ status: 403 });
  });

  it('resout un super_admin en owner virtuel SUR LE TENANT DU HEADER', async () => {
    // Un operateur plateforme n'a aucune ligne admin_users sur les tenants
    // clients: le layout lui fabrique un owner virtuel sans creer de ligne.
    // Sans cette resolution, le refus ci-dessus casserait la console plateforme.
    mockHeaderGet.mockReturnValue('client-b');
    let adminUsersCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-client-b' } });
      adminUsersCall += 1;
      // 1er appel = lookup scope (non membre) ; 2e = ligne super_admin vivante.
      return adminUsersCall === 1
        ? chain({ data: null })
        : chain({ data: { id: 'membership-super' } });
    });

    const res = await getAuthenticatedUserWithTenant();

    expect(res.tenantId).toBe('tenant-client-b');
    expect(res.role).toBe('owner');
    expect(res.adminUserId).toBe('membership-super');
  });
});

describe('getAuthenticatedUserWithTenant - permission enforcement (overrides bite)', () => {
  it('throws 403 when a per-user custom_permissions override revokes the required permission', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'role_permissions') return chain({ data: null });
      // manager whose custom_permissions explicitly revoke menu.edit
      return chain({
        data: {
          id: 'm-1',
          tenant_id: 'tenant-A',
          role: 'manager',
          custom_permissions: { 'menu.edit': false },
        },
      });
    });

    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 403 when a per-tenant role_permissions override revokes the permission', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'role_permissions')
        return chain({ data: { permissions: { 'menu.edit': false } } });
      return chain({
        data: { id: 'm-1', tenant_id: 'tenant-A', role: 'manager', custom_permissions: null },
      });
    });

    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('allows when the role has the permission by default and no override revokes it', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'role_permissions') return chain({ data: null });
      return chain({
        data: { id: 'm-1', tenant_id: 'tenant-A', role: 'manager', custom_permissions: null },
      });
    });

    // manager has menu.edit in the default matrix -> resolves without throwing
    const res = await getAuthenticatedUserWithTenant('menu.edit');
    expect(res.tenantId).toBe('tenant-A');
    expect(res.role).toBe('manager');
  });
});
