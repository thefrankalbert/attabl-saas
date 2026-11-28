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

import { getAuthenticatedUserForTenant, getAuthenticatedUserWithTenant } from '../get-session';
import { getEffectiveLevels } from '@/lib/permissions';

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

// Lecture de `poste_permissions`: select().eq().in() rend un TABLEAU de lignes.
function posteChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) c[m] = vi.fn(() => c);
  c.in = vi.fn(() => Promise.resolve({ data: rows, error: null }));
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
      return chain({
        data: {
          id: 'membership-B',
          tenant_id: 'tenant-B',
          postes: ['owner'],
          permission_overrides: null,
        },
      });
    });

    const res = await getAuthenticatedUserWithTenant();

    expect(res.tenantId).toBe('tenant-B');
    expect(res.adminUserId).toBe('membership-B');
    expect(res.postes).toEqual(['owner']);
    expect(res.isOwner).toBe(true);
  });

  it('falls back to the oldest membership when no x-tenant-slug header is present', async () => {
    mockHeaderGet.mockReturnValue(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: null });
      if (table === 'poste_permissions') return posteChain([]);
      // oldest-membership fallback
      return chain({
        data: {
          id: 'membership-A',
          tenant_id: 'tenant-A',
          postes: ['manager'],
          permission_overrides: null,
        },
      });
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
    expect(res.postes).toEqual(['owner']);
    expect(res.levels).toEqual(getEffectiveLevels({ postes: ['owner'] }));
    expect(res.adminUserId).toBe('membership-super');
  });
});

describe('getAuthenticatedUserWithTenant - permission enforcement (overrides bite)', () => {
  it('throws 403 when a per-user permission_overrides revokes the required permission', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'poste_permissions') return posteChain([]);
      // manager whose permission_overrides explicitly revoke menu.edit
      return chain({
        data: {
          id: 'm-1',
          tenant_id: 'tenant-A',
          postes: ['manager'],
          permission_overrides: { 'menu.edit': false },
        },
      });
    });

    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 403 when a per-tenant poste_permissions setting revokes the permission', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'poste_permissions')
        return posteChain([{ poste: 'manager', permissions: { 'menu.edit': false } }]);
      return chain({
        data: { id: 'm-1', tenant_id: 'tenant-A', postes: ['manager'], permission_overrides: null },
      });
    });

    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('allows when the poste has the permission by default and no override revokes it', async () => {
    mockHeaderGet.mockReturnValue('tenant-a-slug');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (table === 'poste_permissions') return posteChain([]);
      return chain({
        data: { id: 'm-1', tenant_id: 'tenant-A', postes: ['manager'], permission_overrides: null },
      });
    });

    // manager has menu.edit in the default matrix -> resolves without throwing
    const res = await getAuthenticatedUserWithTenant('menu.edit');
    expect(res.tenantId).toBe('tenant-A');
    expect(res.postes).toEqual(['manager']);
  });
});

describe('getAuthenticatedUserForTenant - perimetre et exigences', () => {
  const row = (postes: string[]) => ({
    id: 'm-1',
    tenant_id: 'tenant-A',
    postes,
    permission_overrides: null,
  });

  /** Imite la base: la ligne retiree n'est rendue que si le filtre deleted_at est ABSENT. */
  function memberTable(member: Record<string, unknown>, deleted: boolean) {
    let filtered = false;
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'order', 'limit']) c[m] = vi.fn(() => c);
    c.is = vi.fn((col: string, val: unknown) => {
      if (col === 'deleted_at' && val === null) filtered = true;
      return c;
    });
    c.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: deleted && filtered ? null : member, error: null }),
    );
    return c;
  }

  it('refuse un membre retire (deleted_at non nul): le filtre est applique', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : memberTable(row(['owner']), true),
    );
    await expect(getAuthenticatedUserForTenant('tenant-A')).rejects.toMatchObject({ status: 403 });
  });

  it('temoin: meme membre non retire, accepte', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : memberTable(row(['owner']), false),
    );
    const res = await getAuthenticatedUserForTenant('tenant-A');
    expect(res.tenantId).toBe('tenant-A');
  });

  it('cumul: serveur + caissier passe orders.pay, serveur seul non', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : chain({ data: row(['waiter', 'cashier']) }),
    );
    const res = await getAuthenticatedUserForTenant('tenant-A', 'orders.pay');
    expect([...res.postes].sort()).toEqual(['cashier', 'waiter']);

    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : chain({ data: row(['waiter']) }),
    );
    await expect(getAuthenticatedUserForTenant('tenant-A', 'orders.pay')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('anyOf: un seul des droits en entier suffit; aucun refuse', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : chain({ data: row(['chef']) }),
    );
    const ok = await getAuthenticatedUserForTenant('tenant-A', {
      anyOf: ['kitchen.track', 'orders.pay'],
    });
    expect(ok.postes).toEqual(['chef']);
    await expect(
      getAuthenticatedUserForTenant('tenant-A', { anyOf: ['orders.take', 'orders.pay'] }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('atLeastLimited: le niveau borne suffit, mais pas l absence de droit', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : chain({ data: row(['manager']) }),
    );
    // le gerant a billing.manage au niveau limited: lecture permise, ecriture refusee
    const ok = await getAuthenticatedUserForTenant('tenant-A', {
      atLeastLimited: 'billing.manage',
    });
    expect(ok.levels['billing.manage']).toBe('limited');
    await expect(getAuthenticatedUserForTenant('tenant-A', 'billing.manage')).rejects.toMatchObject(
      {
        status: 403,
      },
    );

    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain([]) : chain({ data: row(['chef']) }),
    );
    await expect(
      getAuthenticatedUserForTenant('tenant-A', { atLeastLimited: 'billing.manage' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
