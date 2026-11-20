import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminPermission } from '../resolve-admin-permission';

type Reply = { data: unknown; error: unknown };

/** Faux client: une reponse par table, toute la chaine se termine par maybeSingle. */
function client(replies: Record<string, Reply>): SupabaseClient {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = async () => replies[table];
      return chain;
    },
  } as unknown as SupabaseClient;
}

const caissier: Reply = {
  data: { role: 'cashier', custom_permissions: null, is_super_admin: false },
  error: null,
};

describe('resolveAdminPermission - surcharge de role', () => {
  it('temoin: sans surcharge, le caissier peut encaisser (matrice par defaut)', async () => {
    const r = await resolveAdminPermission(
      client({ admin_users: caissier, role_permissions: { data: null, error: null } }),
      'u1',
      't1',
      'orders.pay',
    );
    expect(r.allowed).toBe(true);
  });

  it('une surcharge qui retire le droit le refuse', async () => {
    const r = await resolveAdminPermission(
      client({
        admin_users: caissier,
        role_permissions: { data: { permissions: { 'orders.pay': false } }, error: null },
      }),
      'u1',
      't1',
      'orders.pay',
    );
    expect(r.allowed).toBe(false);
  });

  it('ECHEC FERME: si la lecture de la surcharge echoue, l acces est refuse', async () => {
    const r = await resolveAdminPermission(
      client({
        admin_users: caissier,
        role_permissions: { data: null, error: { message: 'timeout' } },
      }),
      'u1',
      't1',
      'orders.pay',
    );
    expect(r).toEqual({ allowed: false, role: 'cashier' });
  });

  it('la panne ne ferme rien a ceux dont la reponse ne depend pas de la surcharge', async () => {
    const panne: Reply = { data: null, error: { message: 'timeout' } };
    const proprietaire: Reply = {
      data: { role: 'owner', custom_permissions: null, is_super_admin: false },
      error: null,
    };
    const caissierAvecDroitIndividuel: Reply = {
      data: { role: 'cashier', custom_permissions: { 'orders.pay': true }, is_super_admin: false },
      error: null,
    };

    expect(
      await resolveAdminPermission(
        client({ admin_users: proprietaire, role_permissions: panne }),
        'u1',
        't1',
        'orders.pay',
      ),
    ).toEqual({ allowed: true, role: 'owner' });
    expect(
      await resolveAdminPermission(
        client({ admin_users: caissierAvecDroitIndividuel, role_permissions: panne }),
        'u1',
        't1',
        'orders.pay',
      ),
    ).toEqual({ allowed: true, role: 'cashier' });
  });
});
