import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteAccountsWithoutMembership,
  deleteStraySeedAccounts,
  listTenantMemberUserIds,
} from '../../../scripts/lib/seed-accounts';

/**
 * Nettoyage des comptes des seeds (scripts/seed-demo.ts, scripts/seed-qa.ts).
 * La regle protegee : JAMAIS de suppression decidee sur l'email seul. Un compte
 * qui appartient encore a un restaurant n'est pas supprime.
 */
interface Membership {
  user_id: string;
  tenant_id: string;
  slug: string;
}

function fakeClient(memberships: Membership[], users: { id: string; email: string }[]) {
  const deleteUser = vi.fn(async (userId: string) => {
    void userId;
    return { error: null };
  });
  const client = {
    from: () => ({
      select: () => ({
        eq: async (column: string, value: string) => ({
          data: memberships
            .filter((m) => (column === 'user_id' ? m.user_id : m.tenant_id) === value)
            .map((m) => ({
              user_id: m.user_id,
              tenant_id: m.tenant_id,
              tenants: { slug: m.slug },
            })),
          error: null,
        }),
      }),
    }),
    auth: { admin: { deleteUser, listUsers: async () => ({ data: { users }, error: null }) } },
  };
  return { client: client as unknown as SupabaseClient, deleteUser };
}

const log = () => undefined;

describe('listTenantMemberUserIds', () => {
  it('rend les comptes des membres du restaurant, sans doublon', async () => {
    const { client } = fakeClient(
      [
        { user_id: 'u1', tenant_id: 't1', slug: 'demo' },
        { user_id: 'u2', tenant_id: 't1', slug: 'demo' },
        { user_id: 'u3', tenant_id: 't2', slug: 'autre' },
      ],
      [],
    );
    expect(await listTenantMemberUserIds(client, 't1')).toEqual(['u1', 'u2']);
  });
});

describe('deleteAccountsWithoutMembership', () => {
  it('supprime le compte qui n a plus aucune ligne, garde celui qui est membre ailleurs', async () => {
    const { client, deleteUser } = fakeClient(
      [{ user_id: 'u2', tenant_id: 't2', slug: 'autre' }],
      [],
    );
    await deleteAccountsWithoutMembership(client, ['u1', 'u2'], log);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});

describe('deleteStraySeedAccounts', () => {
  const users = [
    { id: 'u1', email: 'owner@demo.attabl.com' },
    { id: 'u2', email: 'chef@demo.attabl.com' },
    { id: 'u9', email: 'quelquun@ailleurs.test' },
  ];
  const emails = ['owner@demo.attabl.com', 'chef@demo.attabl.com'];

  it('supprime les comptes du seed qui n appartiennent a aucun restaurant, et eux seuls', async () => {
    const { client, deleteUser } = fakeClient([], users);
    await deleteStraySeedAccounts(client, emails, log);
    expect(deleteUser.mock.calls.map((call) => call[0])).toEqual(['u1', 'u2']);
  });

  it('s arrete et nomme le restaurant si un email du seed y est membre, sans RIEN supprimer', async () => {
    const { client, deleteUser } = fakeClient(
      [{ user_id: 'u2', tenant_id: 't7', slug: 'vrai-restaurant' }],
      users,
    );
    await expect(deleteStraySeedAccounts(client, emails, log)).rejects.toThrow(/vrai-restaurant/);
    // Pas meme le premier compte, pourtant sans restaurant : tout est verifie
    // avant la premiere suppression.
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
