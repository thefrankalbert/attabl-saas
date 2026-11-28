import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceManagerService } from '../service-manager.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// order.service est un fichier protege: on simule seulement la lecture des
// commandes pretes, le reste du service n'est pas concerne ici.
vi.mock('../order.service', () => ({
  createOrderService: () => ({ listReadyOrdersToday: async () => [] }),
}));

type Result = { data: unknown; error: { message: string } | null };

interface World {
  members: Record<string, unknown>[];
  posteRead: Result;
}
let world: World;

function member(id: string, postes: string[], overrides: Record<string, boolean> | null = null) {
  return {
    id,
    tenant_id: 'tenant-A',
    user_id: `auth-${id}`,
    full_name: `Nom ${id}`,
    postes,
    permission_overrides: overrides,
    is_active: true,
  };
}

function client(): SupabaseClient {
  return {
    from: (table: string) => {
      const result: Result =
        table === 'admin_users'
          ? { data: world.members, error: null }
          : table === 'poste_permissions'
            ? world.posteRead
            : { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order']) chain[m] = () => chain;
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
      return chain;
    },
  } as unknown as SupabaseClient;
}

const ids = async () =>
  (await createServiceManagerService(client()).loadDashboard('tenant-A')).servers.map((s) => s.id);

beforeEach(() => {
  world = { members: [], posteRead: { data: [], error: null } };
});

describe('loadDashboard: serveurs proposes = droit EFFECTIF orders.take entier', () => {
  it('un serveur est propose, un chef ne l est pas', async () => {
    world.members = [member('w', ['waiter']), member('c', ['chef'])];
    expect(await ids()).toEqual(['w']);
  });

  it('un serveur dont orders.take est retire par personne n est pas propose (temoin: sans reglage il l est)', async () => {
    world.members = [member('w1', ['waiter']), member('w2', ['waiter'], { 'orders.take': false })];
    expect(await ids()).toEqual(['w1']);
  });

  it('le restaurant retire orders.take au poste serveur: refuse, mais un serveur+caissier reste propose (cumul)', async () => {
    world.members = [member('w', ['waiter']), member('wc', ['waiter', 'cashier'])];
    world.posteRead = {
      data: [{ poste: 'waiter', permissions: { 'orders.take': false } }],
      error: null,
    };
    expect(await ids()).toEqual(['wc']);
  });

  it('un reglage personnel a true rend propose un membre dont le poste n a pas le droit', async () => {
    world.members = [member('c', ['chef'], { 'orders.take': true })];
    expect(await ids()).toEqual(['c']);
  });

  it('echec de lecture de poste_permissions: ServiceError (echec ferme)', async () => {
    world.members = [member('w', ['waiter'])];
    world.posteRead = { data: null, error: { message: 'timeout' } };
    await expect(
      createServiceManagerService(client()).loadDashboard('tenant-A'),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('permission_overrides ne quitte pas le service', async () => {
    world.members = [member('w', ['waiter'], { 'orders.take': true })];
    const { servers } = await createServiceManagerService(client()).loadDashboard('tenant-A');
    expect(servers).toHaveLength(1);
    expect(servers[0]).not.toHaveProperty('permission_overrides');
    expect(servers[0]).toMatchObject({ id: 'w', postes: ['waiter'] });
  });
});
