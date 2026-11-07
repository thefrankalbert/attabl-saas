import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformAdminService } from '../platform-admin.service';
import { ServiceError } from '../errors';

interface TableState {
  row?: Record<string, unknown> | null;
  rowError?: unknown;
  mutError?: unknown;
}

/**
 * Builds a chainable Supabase mock keyed by table name. Records the payloads
 * passed to update()/insert() so tests can assert what was written.
 */
function makeAdmin(tables: Record<string, TableState>) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const from = vi.fn((table: string) => {
    const state = tables[table] ?? {};
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() =>
      Promise.resolve({ data: state.row ?? [], error: state.rowError ?? null }),
    );
    chain.is = vi.fn(() => Promise.resolve({ error: state.mutError ?? null }));
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: state.row ?? null, error: state.rowError ?? null }),
    );
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      // update().eq().is() is terminal; also support update().eq() (no .is()).
      const updChain: Record<string, unknown> = {};
      updChain.eq = vi.fn(() => {
        updChain.is = vi.fn(() => Promise.resolve({ error: state.mutError ?? null }));
        // restoreTenant ends at .eq() (no .is()), so make eq() awaitable too.
        return Object.assign(Promise.resolve({ error: state.mutError ?? null }), updChain);
      });
      return updChain;
    });
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      inserts.push({ table, payload });
      return Promise.resolve({ error: null });
    });
    return chain;
  });

  return { client: { from } as unknown as SupabaseClient, updates, inserts };
}

const actor = { userId: 'super-1', email: 'boss@attabl.com' };

describe('createPlatformAdminService', () => {
  it('suspendTenant sets the suspend fields, scopes to live rows, and audits', async () => {
    const { client, updates, inserts } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto' } },
    });

    await createPlatformAdminService(client).suspendTenant('t-1', actor, 'non-paiement');

    const upd = updates.find((u) => u.table === 'tenants')!;
    expect(upd.payload.is_active).toBe(false);
    expect(upd.payload.suspend_reason).toBe('non-paiement');
    expect(upd.payload.suspended_by).toBe('super-1');
    expect(upd.payload).toHaveProperty('suspended_at');

    const audit = inserts.find((i) => i.table === 'platform_audit_log')!;
    expect(audit.payload.action).toBe('suspend_tenant');
    expect(audit.payload.target_type).toBe('tenant');
    expect(audit.payload.actor_user_id).toBe('super-1');
    expect(audit.payload.target_label).toBe('Resto (resto)');
  });

  it('softDeleteTenant stamps deleted_at/deleted_by and audits soft_delete_tenant', async () => {
    const { client, updates, inserts } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto' } },
    });

    await createPlatformAdminService(client).softDeleteTenant('t-1', actor);

    const upd = updates.find((u) => u.table === 'tenants')!;
    expect(upd.payload).toHaveProperty('deleted_at');
    expect(upd.payload.deleted_by).toBe('super-1');
    expect(upd.payload.is_active).toBe(false);
    expect(inserts.find((i) => i.table === 'platform_audit_log')!.payload.action).toBe(
      'soft_delete_tenant',
    );
  });

  it('restoreTenant clears the lifecycle fields and audits restore_tenant', async () => {
    // `subscription_status` est NOT NULL en base: un decor sans statut testait
    // un etat impossible, et masquait le fait que la garde doit le lire.
    const { client, updates, inserts } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto', subscription_status: 'active' } },
    });

    await createPlatformAdminService(client).restoreTenant('t-1', actor);

    const upd = updates.find((u) => u.table === 'tenants')!;
    expect(upd.payload.deleted_at).toBeNull();
    expect(upd.payload.is_active).toBe(true);
    expect(upd.payload.suspended_at).toBeNull();
    expect(inserts.find((i) => i.table === 'platform_audit_log')!.payload.action).toBe(
      'restore_tenant',
    );
  });

  // Un restaurant GELE ne se remet pas en service par un geste de suspension.
  //
  // Le gel est une decision de FACTURATION (essai expire, abonnement supprime,
  // impaye, litige); la suspension est une decision de PLATEFORME. Les deux
  // ecrivaient dans la meme colonne sans se parler: lever une suspension sur un
  // restaurant gele le remettait en service, et le gel ne gelait plus rien.
  // C'est une fuite de revenu, pas un detail d'ergonomie.
  it('unsuspendTenant REFUSE de reactiver un restaurant gele', async () => {
    const { client, updates } = makeAdmin({
      tenants: {
        row: {
          name: 'Resto',
          slug: 'resto',
          subscription_status: 'frozen',
          freeze_reason: 'trial_expired',
        },
      },
    });

    await expect(createPlatformAdminService(client).unsuspendTenant('t-1', actor)).rejects.toThrow(
      ServiceError,
    );
    // Et surtout: RIEN n'a ete ecrit. Un refus qui ecrit quand meme ne protege rien.
    expect(updates.find((u) => u.table === 'tenants')).toBeUndefined();
  });

  it('le refus nomme la cause du gel, pour que l operateur sache quoi faire', async () => {
    const { client } = makeAdmin({
      tenants: {
        row: {
          name: 'Resto',
          slug: 'resto',
          subscription_status: 'frozen',
          freeze_reason: 'stripe_unpaid',
        },
      },
    });

    await expect(createPlatformAdminService(client).unsuspendTenant('t-1', actor)).rejects.toThrow(
      /stripe_unpaid/,
    );
  });

  it('restoreTenant REFUSE aussi de restaurer un restaurant gele', async () => {
    const { client, updates } = makeAdmin({
      tenants: {
        row: { name: 'Resto', slug: 'resto', subscription_status: 'frozen', freeze_reason: null },
      },
    });

    await expect(createPlatformAdminService(client).restoreTenant('t-1', actor)).rejects.toThrow(
      ServiceError,
    );
    expect(updates.find((u) => u.table === 'tenants')).toBeUndefined();
  });

  // ELARGISSEMENT DU 2026-11-07. La garde ne refusait que `frozen`, alors que
  // `isSubscriptionUsable` n'autorise que `trial`, `active` et `past_due`. Un
  // restaurant RESILIE ou EN PAUSE passait donc la garde, et "reactiver" depuis
  // la console le remettait en service sans qu'il paie.
  it.each([
    ['resilie', 'cancelled', /resilie/],
    ['en pause', 'paused', /en pause/],
  ])(
    'unsuspendTenant REFUSE de reactiver un restaurant %s, et le dit en clair',
    async (_nom, statut, messageAttendu) => {
      const { client, updates } = makeAdmin({
        tenants: {
          row: { name: 'Resto', slug: 'resto', subscription_status: statut, freeze_reason: null },
        },
      });

      await expect(
        createPlatformAdminService(client).unsuspendTenant('t-1', actor),
      ).rejects.toThrow(messageAttendu);
      // Un refus qui ecrit quand meme ne protege rien.
      expect(updates.find((u) => u.table === 'tenants')).toBeUndefined();
    },
  );

  it.each([
    ['resilie', 'cancelled'],
    ['en pause', 'paused'],
  ])('restoreTenant REFUSE aussi de restaurer un restaurant %s', async (_nom, statut) => {
    const { client, updates } = makeAdmin({
      tenants: {
        row: { name: 'Resto', slug: 'resto', subscription_status: statut, freeze_reason: null },
      },
    });

    await expect(createPlatformAdminService(client).restoreTenant('t-1', actor)).rejects.toThrow(
      ServiceError,
    );
    expect(updates.find((u) => u.table === 'tenants')).toBeUndefined();
  });

  // Le message du GEL ne doit pas etre remplace par celui de la resiliation: il
  // nomme la cause, et c'est elle qui dit a l'operateur quoi faire.
  it('un restaurant gele garde son message de gel, pas celui de la resiliation', async () => {
    const { client } = makeAdmin({
      tenants: {
        row: {
          name: 'Resto',
          slug: 'resto',
          subscription_status: 'frozen',
          freeze_reason: 'dispute',
        },
      },
    });

    await expect(createPlatformAdminService(client).unsuspendTenant('t-1', actor)).rejects.toThrow(
      /gele \(cause: dispute\)/,
    );
  });

  // Fail-closed, sans inventer de cause: un statut absent ou inconnu refuse,
  // mais ne s'annonce pas comme une resiliation.
  it('un statut inconnu refuse sans pretendre que le restaurant est resilie', async () => {
    const { client, updates } = makeAdmin({
      tenants: {
        row: { name: 'Resto', slug: 'resto', subscription_status: 'wat', freeze_reason: null },
      },
    });

    await expect(createPlatformAdminService(client).unsuspendTenant('t-1', actor)).rejects.toThrow(
      /statut: wat/,
    );
    expect(updates.find((u) => u.table === 'tenants')).toBeUndefined();
  });

  // NON-REGRESSION: les restaurants NON geles doivent toujours pouvoir etre
  // reactives. Sans ce cas, on aurait pu "proteger" en bloquant tout le monde.
  it('unsuspendTenant reactive normalement un restaurant non gele', async () => {
    const { client, updates, inserts } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto', subscription_status: 'active' } },
    });

    await createPlatformAdminService(client).unsuspendTenant('t-1', actor);

    const upd = updates.find((u) => u.table === 'tenants')!;
    expect(upd.payload.is_active).toBe(true);
    expect(upd.payload.suspended_at).toBeNull();
    expect(inserts.find((i) => i.table === 'platform_audit_log')!.payload.action).toBe(
      'unsuspend_tenant',
    );
  });

  // La liste entitlante vit dans `isSubscriptionUsable`. Ces trois cas la
  // figent du cote de la garde: si elle se resserre, un client qui paie se
  // retrouve coupe depuis la console.
  it.each(['trial', 'active', 'past_due'])(
    'non-regression: un restaurant en %s se reactive toujours',
    async (statut) => {
      const { client, updates } = makeAdmin({
        tenants: { row: { name: 'Resto', slug: 'resto', subscription_status: statut } },
      });

      await createPlatformAdminService(client).unsuspendTenant('t-1', actor);

      expect(updates.find((u) => u.table === 'tenants')!.payload.is_active).toBe(true);
    },
  );

  it('banAdminUser blocks login and audits ban_user with the tenant scope', async () => {
    const { client, updates, inserts } = makeAdmin({
      admin_users: { row: { email: 'staff@resto.com', tenant_id: 't-1', role: 'waiter' } },
    });

    await createPlatformAdminService(client).banAdminUser('u-1', actor, 'abus');

    const upd = updates.find((u) => u.table === 'admin_users')!;
    expect(upd.payload.is_active).toBe(false);
    expect(upd.payload.banned_by).toBe('super-1');
    expect(upd.payload.ban_reason).toBe('abus');

    const audit = inserts.find((i) => i.table === 'platform_audit_log')!;
    expect(audit.payload.action).toBe('ban_user');
    expect(audit.payload.target_label).toBe('staff@resto.com');
    expect(audit.payload.tenant_id).toBe('t-1');
  });

  it('restoreAdminUser clears BOTH delete and ban metadata (no contradictory state)', async () => {
    const { client, updates, inserts } = makeAdmin({
      admin_users: { row: { email: 'staff@resto.com', tenant_id: 't-1', role: 'waiter' } },
    });

    await createPlatformAdminService(client).restoreAdminUser('u-1', actor);

    const upd = updates.find((u) => u.table === 'admin_users')!;
    expect(upd.payload.is_active).toBe(true);
    expect(upd.payload.deleted_at).toBeNull();
    // A restored account must not stay flagged as banned, or it would be active
    // (dashboard access) yet labelled "banned" in the console.
    expect(upd.payload.banned_at).toBeNull();
    expect(upd.payload.banned_by).toBeNull();
    expect(upd.payload.ban_reason).toBeNull();
    expect(inserts.find((i) => i.table === 'platform_audit_log')!.payload.action).toBe(
      'restore_user',
    );
  });

  it('throws NOT_FOUND when the tenant does not exist', async () => {
    const { client } = makeAdmin({ tenants: { row: null } });
    await expect(
      createPlatformAdminService(client).suspendTenant('missing', actor),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('throws INTERNAL when the update fails', async () => {
    const { client } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto' }, mutError: { message: 'boom' } },
    });
    await expect(
      createPlatformAdminService(client).suspendTenant('t-1', actor),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
