import { describe, it, expect, vi } from 'vitest';
import { checkTargetAccountScope } from '@/lib/auth/target-account-scope';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

type Row = {
  tenant_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  deleted_at?: string | null;
};

function clientReturning(rows: Row[] | null, error?: { message: string }) {
  const eq = vi.fn(() => Promise.resolve({ data: rows, error: error ?? null }));
  const select = vi.fn(() => ({ eq }));
  return {
    client: { from: vi.fn(() => ({ select })) } as unknown as Parameters<
      typeof checkTargetAccountScope
    >[0],
    select,
    eq,
  };
}

describe('checkTargetAccountScope', () => {
  it('autorise quand toutes les appartenances vivent dans le tenant', async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: false },
      { tenant_id: 'tenant-a', role: 'waiter', is_super_admin: null },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: true,
    });
  });

  it('refuse quand une appartenance vit dans un autre tenant', async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: false },
      { tenant_id: 'tenant-b', role: 'owner', is_super_admin: false },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'cross_tenant',
    });
  });

  it('refuse un compte plateforme marque is_super_admin', async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: true },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'platform_account',
    });
  });

  it("refuse un compte plateforme porte par le role 'super_admin'", async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'super_admin', is_super_admin: null },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'platform_account',
    });
  });

  it('refuse (fail-closed) quand la lecture echoue', async () => {
    const { client } = clientReturning(null, { message: 'boom' });

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'lookup_failed',
    });
  });

  it('refuse (fail-closed) quand aucune appartenance ne remonte', async () => {
    const { client } = clientReturning([]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'lookup_failed',
    });
  });

  // REFUTATION R2 du contre-audit LOT 6. Le relachement "une ligne soft-deleted
  // ne compte plus" doit etre DEMANDE par l'appelant, jamais etre le defaut: il
  // etait pose dans ce garde partage, donc il relachait aussi
  // actionUpdateUserEmail (la primitive de prise de controle), alors que seul
  // l'envoi d'un lien de reinitialisation le justifiait.
  it('par defaut, une appartenance etrangere retiree par la plateforme compte toujours', async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: false, deleted_at: null },
      {
        tenant_id: 'tenant-b',
        role: 'owner',
        is_super_admin: false,
        deleted_at: '2026-11-04T10:00:00.000Z',
      },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'cross_tenant',
    });
  });

  // Correctif R2' point 2: la plateforme (console super-admin) peut retirer une
  // ligne admin_users parasite par soft-delete. Elle ne doit alors plus geler le
  // proprietaire legitime - c'est ce qui rend le cas recuperable sans
  // l'attaquant. Ce relachement est OPT-IN et reserve a l'envoi d'un lien de
  // reinitialisation (cf. le cas precedent).
  it('ignore une appartenance etrangere retiree par la plateforme quand l appelant le demande', async () => {
    const { client } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: false, deleted_at: null },
      {
        tenant_id: 'tenant-b',
        role: 'owner',
        is_super_admin: false,
        deleted_at: '2026-11-04T10:00:00.000Z',
      },
    ]);

    await expect(
      checkTargetAccountScope(client, 'user-1', 'tenant-a', {
        ignoreSoftDeletedMemberships: true,
      }),
    ).resolves.toEqual({
      allowed: true,
    });
  });

  it('refuse toujours un compte plateforme meme si sa ligne est soft-deleted', async () => {
    const { client } = clientReturning([
      {
        tenant_id: 'tenant-a',
        role: 'manager',
        is_super_admin: true,
        deleted_at: '2026-11-04T10:00:00.000Z',
      },
    ]);

    await expect(checkTargetAccountScope(client, 'user-1', 'tenant-a')).resolves.toEqual({
      allowed: false,
      reason: 'platform_account',
    });
  });

  it('refuse (fail-closed) quand toutes les appartenances sont soft-deleted', async () => {
    const { client } = clientReturning([
      {
        tenant_id: 'tenant-a',
        role: 'manager',
        is_super_admin: false,
        deleted_at: '2026-11-04T10:00:00.000Z',
      },
    ]);

    await expect(
      checkTargetAccountScope(client, 'user-1', 'tenant-a', {
        ignoreSoftDeletedMemberships: true,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'lookup_failed',
    });
  });

  it('interroge admin_users par user_id, sans filtre tenant (c est le but du garde)', async () => {
    const { client, select, eq } = clientReturning([
      { tenant_id: 'tenant-a', role: 'manager', is_super_admin: false },
    ]);

    await checkTargetAccountScope(client, 'user-1', 'tenant-a');

    expect(select).toHaveBeenCalledWith('tenant_id, role, is_super_admin, deleted_at');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eq).toHaveBeenCalledTimes(1);
  });
});
