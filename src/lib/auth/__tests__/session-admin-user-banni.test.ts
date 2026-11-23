/**
 * Audit B16: un membre banni ou desactive (seule ligne admin_users inactive)
 * se reconnecte et appelle /api/upload ou /api/onboarding/*. Le resolveur ne
 * lisait que les lignes actives, en trouvait 0, concluait "aucun
 * etablissement" et PROVISIONNAIT un restaurant neuf dont il devenait
 * proprietaire: le bannissement etait contourne.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const ensureTenantForOnboarding = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({ ensureTenantForOnboarding }),
}));

/** Toutes les lignes admin_users du compte; la fausse base applique `is_active`. */
let lignes: Array<{ tenant_id: string; role: string; is_active: boolean; tenants: unknown }> = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const filtres: Array<[string, unknown]> = [];
        const builder = {
          eq(col: string, val: unknown) {
            filtres.push([col, val]);
            return builder;
          },
          then(resolve: (v: unknown) => void) {
            const data = lignes.filter((l) =>
              filtres.every(([c, v]) => c === 'user_id' || (l as Record<string, unknown>)[c] === v),
            );
            resolve({ data, error: null });
          },
        };
        return builder;
      },
    }),
  }),
}));

import { resolveSessionAdminUser } from '../session-admin-user';

const tenants = { slug: 'resto', onboarding_completed: true, created_at: '1' };

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } });
});

describe('resolveSessionAdminUser - compte banni ou desactive (B16)', () => {
  it('seule ligne inactive: refus, et AUCUN restaurant provisionne', async () => {
    lignes = [{ tenant_id: 't1', role: 'waiter', is_active: false, tenants }];

    const r = await resolveSessionAdminUser({ requireActive: true, provisionIfMissing: true });

    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });

  it('temoin: aucune ligne du tout (inscription interrompue), le provisionnement sauve le compte', async () => {
    lignes = [];
    ensureTenantForOnboarding.mockImplementation(async () => {
      lignes = [{ tenant_id: 't-neuf', role: 'owner', is_active: true, tenants }];
    });

    const r = await resolveSessionAdminUser({ requireActive: true, provisionIfMissing: true });

    expect(ensureTenantForOnboarding).toHaveBeenCalledTimes(1);
    expect(r.ok && r.adminUser.tenant_id).toBe('t-neuf');
  });
});
