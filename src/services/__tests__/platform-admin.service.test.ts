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
    const { client, updates, inserts } = makeAdmin({
      tenants: { row: { name: 'Resto', slug: 'resto' } },
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
