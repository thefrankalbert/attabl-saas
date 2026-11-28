import { describe, it, expect, vi } from 'vitest';

// Audit d'equipe du 2026-11-27 (onboarding C1): en mode proprietaire, la page
// lisait en service_role TOUS les restaurants de l'utilisateur, y compris ceux
// ou il n'est qu'employe (plan, abonnement, logo).

const { adminIn, memberships } = vi.hoisted(() => ({
  adminIn: vi.fn(),
  memberships: {
    rows: [] as Array<{ role: string; tenant_id: string; is_super_admin: boolean }>,
  },
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/auth/mfa-guard', () => ({ enforceMfa: vi.fn(async () => {}) }));
vi.mock('../tenants-page-client', () => ({ default: () => null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.is = async () => ({
      data: memberships.rows.map((r) => ({ ...r, full_name: 'A', tenants: null })),
    });
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) },
      from: () => b,
    };
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (col: string, ids: string[]) => {
          adminIn(col, ids);
          return Promise.resolve({ data: [] });
        },
      }),
    }),
  }),
}));

import TenantsPage from '../page';

describe('/admin/tenants en mode proprietaire', () => {
  it('ne lit que les restaurants dont il est PROPRIETAIRE', async () => {
    memberships.rows = [
      { role: 'owner', tenant_id: 'resto-a', is_super_admin: false },
      { role: 'waiter', tenant_id: 'resto-b', is_super_admin: false },
    ];
    await TenantsPage();
    expect(adminIn).toHaveBeenCalledWith('id', ['resto-a']);
  });

  it('temoin: deux restaurants possedes, les deux sont lus', async () => {
    adminIn.mockClear();
    memberships.rows = [
      { role: 'owner', tenant_id: 'resto-a', is_super_admin: false },
      { role: 'owner', tenant_id: 'resto-c', is_super_admin: false },
    ];
    await TenantsPage();
    expect(adminIn).toHaveBeenCalledWith('id', ['resto-a', 'resto-c']);
  });
});
