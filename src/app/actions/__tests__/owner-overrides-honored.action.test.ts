import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing } = vi.hoisted(() => ({ mockAssertServing: vi.fn() }));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

/**
 * X9: chaque action du catalogue, du stock et des reglages verifiait une liste
 * de roles AVANT la permission fine. Le droit que le
 * proprietaire accordait dans /settings/permissions (ex: menu.edit au chef)
 * etait donc annule en silence, alors que les imports (permission seule)
 * l'acceptaient. La permission fine decide desormais seule, dans les deux sens.
 * Vraie garde (get-session -> resolveMemberLevels); seul le client Supabase est simule.
 */

vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({
    imageUrlsOf: async () => [],
    logoUrlOf: async () => [],
    release: async () => undefined,
    releaseUnreferencedFiles: async () => undefined,
    purgeTenant: async () => undefined,
  }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const CATEGORY_ID = '66666666-6666-4666-a666-666666666666';

// `posteOverride` : reglage du restaurant pour le poste (table poste_permissions).
// `personOverride` : reglage par personne (colonne permission_overrides).
const state: {
  poste: string;
  posteOverride: Record<string, boolean> | null;
  personOverride: Record<string, boolean> | null;
} = {
  poste: 'chef',
  posteOverride: null,
  personOverride: null,
};
const mockCategoryUpdate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b.c' } } }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in']) c[m] = vi.fn(() => c);
      c.maybeSingle = vi.fn(async () => ({
        data: {
          id: 'admin-1',
          tenant_id: TENANT_ID,
          postes: [state.poste],
          permission_overrides: state.personOverride,
        },
        error: null,
      }));
      // poste_permissions: un TABLEAU de lignes { poste, permissions }.
      if (table === 'poste_permissions') {
        c.then = (ok: (v: { data: unknown; error: null }) => unknown) =>
          ok({
            data: state.posteOverride
              ? [{ poste: state.poste, permissions: state.posteOverride }]
              : [],
            error: null,
          });
      }
      c.update = vi.fn((payload: unknown) => {
        mockCategoryUpdate(table, payload);
        const r: Record<string, unknown> = {};
        r.eq = vi.fn(() => r);
        r.then = (ok: (v: { error: null }) => unknown) => ok({ error: null });
        return r;
      });
      return c;
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.poste = 'chef';
  state.posteOverride = null;
  state.personOverride = null;
});

describe('reglages du proprietaire honores par les actions du catalogue', () => {
  it('chef par defaut: menu.edit en entier (matrice), accepte', async () => {
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.success).toBe(true);
  });

  it('cuisinier par defaut: pas de menu.edit, refuse', async () => {
    state.poste = 'cook';
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
  });

  it('cuisinier a qui le proprietaire donne menu.edit pour son poste: accepte', async () => {
    state.poste = 'cook';
    state.posteOverride = { 'menu.edit': true };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.success).toBe(true);
    expect(mockCategoryUpdate).toHaveBeenCalledWith('categories', { is_active: false });
  });

  it('cuisinier a qui le proprietaire donne menu.edit par personne: accepte', async () => {
    state.poste = 'cook';
    state.personOverride = { 'menu.edit': true };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.success).toBe(true);
  });

  it('chef a qui le proprietaire retire menu.edit pour son poste: refuse', async () => {
    state.posteOverride = { 'menu.edit': false };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
  });

  it('gerant a qui le proprietaire retire menu.edit par personne: refuse', async () => {
    state.poste = 'manager';
    state.personOverride = { 'menu.edit': false };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.error).toBe('Permissions insuffisantes');
  });
});
