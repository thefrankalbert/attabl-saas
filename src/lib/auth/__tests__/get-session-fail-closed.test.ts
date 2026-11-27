import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit B22 et B23 (get-session.ts), garde des mutations.
// B22: une lecture `role_permissions` en ERREUR retombait sur la matrice par
//      defaut et reaccordait une permission que le restaurant avait retiree.
// B23: slug present mais ligne `tenants` cachee par la RLS (restaurant
//      inactif): le refus etait saute et l'ecriture partait sur l'appartenance
//      la plus ancienne de l'utilisateur, un autre restaurant.

const { mockGetUser, mockGetClaims, mockFrom, mockHeaderGet, mockGetTenant } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetClaims: vi.fn(),
  mockFrom: vi.fn(),
  mockHeaderGet: vi.fn(),
  mockGetTenant: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser, getClaims: mockGetClaims }, from: mockFrom }),
  ),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeaderGet })),
}));
vi.mock('@/lib/cache', () => ({ getTenant: mockGetTenant }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getAuthenticatedUserForTenant, getAuthenticatedUserWithTenant } from '../get-session';

type Result = { data: unknown; error?: { message: string } | null };

function chain(result: Result) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve({ error: null, ...result }));
  c.single = vi.fn(() => Promise.resolve({ error: null, ...result }));
  return c;
}

const MANAGER = { id: 'm-1', tenant_id: 'tenant-A', role: 'manager', custom_permissions: null };
const PANNE = { data: null, error: { message: 'timeout' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null });
});

describe('B22 - lecture role_permissions en erreur: echec ferme', () => {
  it('getAuthenticatedUserForTenant refuse quand la surcharge de role ne peut pas etre lue', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'role_permissions' ? chain(PANNE) : chain({ data: MANAGER }),
    );
    await expect(
      getAuthenticatedUserForTenant('tenant-A', ['owner', 'admin', 'manager'], 'orders.pay'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('getAuthenticatedUserWithTenant refuse aussi', async () => {
    mockHeaderGet.mockReturnValue('tenant-a');
    mockFrom.mockImplementation((t: string) => {
      if (t === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (t === 'role_permissions') return chain(PANNE);
      return chain({ data: MANAGER });
    });
    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('temoin: une permission individuelle decide, la panne de surcharge ne compte pas', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'role_permissions'
        ? chain(PANNE)
        : chain({ data: { ...MANAGER, custom_permissions: { 'orders.pay': true } } }),
    );
    const res = await getAuthenticatedUserForTenant(
      'tenant-A',
      ['owner', 'admin', 'manager'],
      'orders.pay',
    );
    expect(res.tenantId).toBe('tenant-A');
  });

  it('temoin: surcharge lue sans erreur, la matrice par defaut accorde', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'role_permissions' ? chain({ data: null }) : chain({ data: MANAGER }),
    );
    const res = await getAuthenticatedUserForTenant(
      'tenant-A',
      ['owner', 'admin', 'manager'],
      'orders.pay',
    );
    expect(res.role).toBe('manager');
  });
});

describe('B23 - slug present mais tenant invisible', () => {
  it('membre ordinaire: 403 au lieu du repli sur son plus ancien restaurant', async () => {
    mockHeaderGet.mockReturnValue('client-b-suspendu');
    mockFrom.mockImplementation((t: string) => {
      if (t === 'tenants') return chain({ data: null });
      // ligne super_admin: aucune ; repli: appartenance A
      return chain({ data: null });
    });
    mockGetTenant.mockResolvedValue({ id: 'tenant-B' });
    await expect(getAuthenticatedUserWithTenant()).rejects.toMatchObject({ status: 403 });
  });

  it('membre ordinaire avec une appartenance A: jamais redirige vers A', async () => {
    mockHeaderGet.mockReturnValue('client-b-suspendu');
    mockFrom.mockImplementation((t: string) => {
      if (t === 'tenants') return chain({ data: null });
      // La recherche super_admin passe par `.or(...)`: aucune ligne. Toute
      // autre lecture (le repli) renverrait l'appartenance A.
      const c = chain({ data: { id: 'mem-A', tenant_id: 'tenant-A', role: 'owner' } });
      c.or = vi.fn(() => chain({ data: null }));
      return c;
    });
    await expect(getAuthenticatedUserWithTenant()).rejects.toMatchObject({ status: 403 });
  });

  it('super_admin: owner virtuel sur le restaurant inactif, resolu par la lecture du layout', async () => {
    // Session renforcee (facteur verifie + aal2): seule condition du mode dieu.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.c', factors: [{ status: 'verified' }] } },
      error: null,
    });
    mockGetClaims.mockResolvedValue({ data: { claims: { aal: 'aal2' } }, error: null });
    mockHeaderGet.mockReturnValue('client-b-suspendu');
    mockFrom.mockImplementation((t: string) =>
      t === 'tenants' ? chain({ data: null }) : chain({ data: { id: 'membership-super' } }),
    );
    mockGetTenant.mockResolvedValue({ id: 'tenant-B' });
    const res = await getAuthenticatedUserWithTenant();
    expect(mockGetTenant).toHaveBeenCalledWith('client-b-suspendu');
    expect(res).toMatchObject({ tenantId: 'tenant-B', role: 'owner' });
  });

  it('super_admin et slug qui ne designe aucun restaurant: 403', async () => {
    mockHeaderGet.mockReturnValue('inexistant');
    mockFrom.mockImplementation((t: string) =>
      t === 'tenants' ? chain({ data: null }) : chain({ data: { id: 'membership-super' } }),
    );
    mockGetTenant.mockResolvedValue(null);
    await expect(getAuthenticatedUserWithTenant()).rejects.toMatchObject({ status: 403 });
  });
});
