import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit B22 et B23 (get-session.ts), garde des mutations.
// B22: une lecture `poste_permissions` en ERREUR retombait sur la matrice par
//      defaut et reaccordait une permission que le restaurant avait retiree.
// B23: slug present mais ligne `tenants` cachee par la RLS (restaurant
//      inactif): le refus etait saute et l'ecriture partait sur l'appartenance
//      la plus ancienne de l'utilisateur, un autre restaurant.

const { mockGetUser, mockFrom, mockHeaderGet, mockGetTenant } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockHeaderGet: vi.fn(),
  mockGetTenant: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser }, from: mockFrom })),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeaderGet })),
}));
vi.mock('@/lib/cache', () => ({ getTenant: mockGetTenant }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getAuthenticatedUserForTenant, getAuthenticatedUserWithTenant } from '../get-session';
import { getEffectiveLevels } from '@/lib/permissions';

type Result = { data: unknown; error?: { message: string } | null };

function chain(result: Result) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve({ error: null, ...result }));
  c.single = vi.fn(() => Promise.resolve({ error: null, ...result }));
  return c;
}

// Lecture de `poste_permissions`: select().eq().in() rend un TABLEAU de lignes.
function posteChain(result: Result) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) c[m] = vi.fn(() => c);
  c.in = vi.fn(() => Promise.resolve({ error: null, ...result }));
  return c;
}

const MANAGER = {
  id: 'm-1',
  tenant_id: 'tenant-A',
  postes: ['manager'],
  permission_overrides: null,
};
const OWNER = { id: 'o-1', tenant_id: 'tenant-A', postes: ['owner'], permission_overrides: null };
const PANNE = { data: null, error: { message: 'timeout' } };
// Le restaurant a donne billing.manage en entier au poste gerant: seul ce reglage
// (illisible en cas de panne) accorde ce droit a un gerant sans reglage personnel.
const REGLAGE_GERANT = { data: [{ poste: 'manager', permissions: { 'billing.manage': true } }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null });
});

describe('B22 - lecture poste_permissions en erreur: echec ferme', () => {
  it('getAuthenticatedUserForTenant refuse un droit que seuls les postes donnent', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain(PANNE) : chain({ data: MANAGER }),
    );
    await expect(getAuthenticatedUserForTenant('tenant-A', 'billing.manage')).rejects.toMatchObject(
      { status: 403 },
    );
  });

  it('getAuthenticatedUserWithTenant refuse aussi', async () => {
    mockHeaderGet.mockReturnValue('tenant-a');
    mockFrom.mockImplementation((t: string) => {
      if (t === 'tenants') return chain({ data: { id: 'tenant-A' } });
      if (t === 'poste_permissions') return posteChain(PANNE);
      return chain({ data: MANAGER });
    });
    await expect(getAuthenticatedUserWithTenant('menu.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('temoin: un droit donne par permission_overrides decide, la panne ne compte pas', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions'
        ? posteChain(PANNE)
        : chain({ data: { ...MANAGER, permission_overrides: { 'billing.manage': true } } }),
    );
    const res = await getAuthenticatedUserForTenant('tenant-A', 'billing.manage');
    expect(res.tenantId).toBe('tenant-A');
  });

  it('temoin: le proprietaire passe toujours, sans aucune lecture de poste_permissions', async () => {
    const lectures = vi.fn();
    mockFrom.mockImplementation((t: string) => {
      if (t === 'poste_permissions') {
        lectures();
        return posteChain(PANNE);
      }
      return chain({ data: OWNER });
    });
    const res = await getAuthenticatedUserForTenant('tenant-A', 'billing.manage');
    expect(res.isOwner).toBe(true);
    expect(lectures).not.toHaveBeenCalled();
  });

  it('temoin: meme membre, lecture reussie, le reglage du restaurant accorde le droit', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain(REGLAGE_GERANT) : chain({ data: MANAGER }),
    );
    const res = await getAuthenticatedUserForTenant('tenant-A', 'billing.manage');
    expect(res.postes).toEqual(['manager']);
    expect(res.levels['billing.manage']).toBe('full');
  });

  it('temoin: lecture reussie sans reglage, la matrice par defaut accorde', async () => {
    mockFrom.mockImplementation((t: string) =>
      t === 'poste_permissions' ? posteChain({ data: [] }) : chain({ data: MANAGER }),
    );
    const res = await getAuthenticatedUserForTenant('tenant-A', 'orders.pay');
    expect(res.postes).toEqual(['manager']);
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
      const c = chain({
        data: { id: 'mem-A', tenant_id: 'tenant-A', postes: ['owner'], permission_overrides: null },
      });
      c.or = vi.fn(() => chain({ data: null }));
      return c;
    });
    await expect(getAuthenticatedUserWithTenant()).rejects.toMatchObject({ status: 403 });
  });

  it('super_admin: owner virtuel sur le restaurant inactif, resolu par la lecture du layout', async () => {
    mockHeaderGet.mockReturnValue('client-b-suspendu');
    mockFrom.mockImplementation((t: string) =>
      t === 'tenants' ? chain({ data: null }) : chain({ data: { id: 'membership-super' } }),
    );
    mockGetTenant.mockResolvedValue({ id: 'tenant-B' });
    const res = await getAuthenticatedUserWithTenant();
    expect(mockGetTenant).toHaveBeenCalledWith('client-b-suspendu');
    expect(res).toMatchObject({ tenantId: 'tenant-B', postes: ['owner'], isOwner: true });
    expect(res.levels).toEqual(getEffectiveLevels({ postes: ['owner'] }));
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
