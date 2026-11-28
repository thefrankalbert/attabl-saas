import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminPermission, resolveLiveMember } from '../resolve-admin-permission';
import { getEffectiveLevels } from '@/lib/permissions';

type Reply = { data: unknown; error: unknown };

/**
 * Faux client. `admin_users`: une file de reponses (1er appel = ligne de membre,
 * 2e appel = recherche super admin). `poste_permissions`: select().eq().in()
 * rend un TABLEAU de lignes.
 */
function client(admin: Reply[], poste: Reply = { data: [], error: null }): SupabaseClient {
  const queue = [...admin];
  return {
    from: (table: string) => {
      if (table === 'poste_permissions') {
        const c: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) c[m] = () => c;
        c.in = async () => poste;
        return c;
      }
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'or', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = async () => queue.shift() ?? { data: null, error: null };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const member = (over: Record<string, unknown> = {}): Reply => ({
  data: {
    id: 'au-1',
    postes: ['cashier'],
    permission_overrides: null,
    is_super_admin: false,
    role: 'cashier',
    ...over,
  },
  error: null,
});

const panne: Reply = { data: null, error: { message: 'timeout' } };

describe('resolveAdminPermission - reglages du restaurant', () => {
  it('temoin: sans reglage, le caissier peut encaisser (matrice par defaut)', async () => {
    const r = await resolveAdminPermission(client([member()]), 'u1', 't1', 'orders.pay');
    expect(r.allowed).toBe(true);
    expect(r.postes).toEqual(['cashier']);
    expect(r.adminUserId).toBe('au-1');
  });

  it('un reglage du restaurant qui retire le droit le refuse', async () => {
    const r = await resolveAdminPermission(
      client([member()], {
        data: [{ poste: 'cashier', permissions: { 'orders.pay': false } }],
        error: null,
      }),
      'u1',
      't1',
      'orders.pay',
    );
    expect(r.allowed).toBe(false);
  });

  it('ECHEC FERME: si la lecture des reglages echoue, l acces est refuse', async () => {
    const r = await resolveAdminPermission(client([member()], panne), 'u1', 't1', 'orders.pay');
    expect(r.allowed).toBe(false);
    expect(r.postes).toEqual(['cashier']);
  });

  it('la panne ne ferme rien a ceux dont la reponse ne depend pas des reglages', async () => {
    const proprietaire = await resolveAdminPermission(
      client([member({ postes: ['owner'], role: 'owner' })], panne),
      'u1',
      't1',
      'orders.pay',
    );
    expect(proprietaire.allowed).toBe(true);
    expect(proprietaire.postes).toEqual(['owner']);

    const droitIndividuel = await resolveAdminPermission(
      client([member({ permission_overrides: { 'orders.pay': true } })], panne),
      'u1',
      't1',
      'orders.pay',
    );
    expect(droitIndividuel.allowed).toBe(true);
  });
});

describe('resolveAdminPermission - super administrateur', () => {
  const owner = getEffectiveLevels({ postes: ['owner'] });

  it('reconnu par is_super_admin sur la ligne de membre', async () => {
    const r = await resolveAdminPermission(
      client([member({ postes: ['waiter'], is_super_admin: true })]),
      'u1',
      't1',
      'team.manage',
    );
    expect(r).toMatchObject({ allowed: true, postes: ['owner'], adminUserId: 'au-1' });
    expect(r.levels).toEqual(owner);
  });

  it('reconnu par role = super_admin sur la ligne de membre', async () => {
    const r = await resolveAdminPermission(
      client([member({ postes: ['waiter'], role: 'super_admin' })]),
      'u1',
      't1',
      'team.manage',
    );
    expect(r).toMatchObject({ allowed: true, postes: ['owner'] });
  });

  it('temoin: la meme ligne sans marque de plateforme reste refusee', async () => {
    const r = await resolveAdminPermission(
      client([member({ postes: ['waiter'] })]),
      'u1',
      't1',
      'team.manage',
    );
    expect(r.allowed).toBe(false);
  });

  it('non membre mais super admin vivant: proprietaire virtuel', async () => {
    const r = await resolveAdminPermission(
      client([
        { data: null, error: null },
        { data: { id: 'au-super' }, error: null },
      ]),
      'u1',
      't1',
      'team.manage',
    );
    expect(r).toMatchObject({ allowed: true, postes: ['owner'], adminUserId: 'au-super' });
  });

  it('non membre et pas super admin: refuse, sans poste', async () => {
    const r = await resolveAdminPermission(client([]), 'u1', 't1', 'team.manage');
    expect(r).toMatchObject({ allowed: false, postes: null, adminUserId: null });
  });
});

describe('resolveLiveMember', () => {
  it('rend le membre vivant avec ses droits', async () => {
    const m = await resolveLiveMember(client([member({ postes: ['manager'] })]), 'u1', 't1');
    expect(m).toMatchObject({
      adminUserId: 'au-1',
      postes: ['manager'],
      isOwner: false,
      isPlatformRow: false,
    });
    expect(m?.levels['orders.take']).toBe('full');
  });

  it('ne donne PAS le passe-droit a un super admin non membre', async () => {
    // Aucune ligne de membre; une ligne super admin existerait en 2e lecture,
    // mais resolveLiveMember ne la consulte pas.
    const m = await resolveLiveMember(
      client([
        { data: null, error: null },
        { data: { id: 'au-super' }, error: null },
      ]),
      'u1',
      't1',
    );
    expect(m).toBeNull();
  });

  it('membre inactif ou retire (la base ne rend aucune ligne): refuse', async () => {
    expect(await resolveLiveMember(client([{ data: null, error: null }]), 'u1', 't1')).toBeNull();
  });

  it('marque la ligne de plateforme', async () => {
    const m = await resolveLiveMember(
      client([member({ postes: ['manager'], is_super_admin: true })]),
      'u1',
      't1',
    );
    expect(m?.isPlatformRow).toBe(true);
  });
});
