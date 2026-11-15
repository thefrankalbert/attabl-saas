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
 * ['owner','admin','manager'] AVANT la permission fine. Le droit que le
 * proprietaire accordait dans /settings/permissions (ex: menu.edit au chef)
 * etait donc annule en silence, alors que les imports (permission seule)
 * l'acceptaient. La permission fine decide desormais seule, dans les deux sens.
 * Vraie garde (get-session -> hasPermission); seul le client Supabase est simule.
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

const state: { role: string; roleOverride: Record<string, boolean> | null } = {
  role: 'chef',
  roleOverride: null,
};
const mockCategoryUpdate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b.c' } } }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is']) c[m] = vi.fn(() => c);
      c.single = vi.fn(async () => ({
        data: { id: 'admin-1', tenant_id: TENANT_ID, role: state.role, custom_permissions: null },
        error: null,
      }));
      c.maybeSingle = vi.fn(async () => ({
        data:
          table === 'role_permissions' && state.roleOverride
            ? { permissions: state.roleOverride }
            : null,
        error: null,
      }));
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
  state.role = 'chef';
  state.roleOverride = null;
});

describe('reglages du proprietaire honores par les actions du catalogue', () => {
  it('chef par defaut: pas de menu.edit, refuse', async () => {
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCategoryUpdate).not.toHaveBeenCalled();
  });

  it('chef a qui le proprietaire donne menu.edit: accepte', async () => {
    state.roleOverride = { 'menu.edit': true };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.success).toBe(true);
    expect(mockCategoryUpdate).toHaveBeenCalledWith('categories', { is_active: false });
  });

  it('gerant a qui le proprietaire retire menu.edit: refuse', async () => {
    state.role = 'manager';
    state.roleOverride = { 'menu.edit': false };
    const { actionToggleCategoryActive } = await import('@/app/actions/categories');
    const res = await actionToggleCategoryActive(TENANT_ID, CATEGORY_ID, false);
    expect(res.error).toBe('Permissions insuffisantes');
  });
});
