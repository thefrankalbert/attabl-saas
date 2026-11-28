import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountDeletionService } from '../account-deletion.service';
import { ServiceError } from '../errors';
import { createFakeSupabase } from './helpers/fake-supabase';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const OWNER = 'user-owner';
const STAFF = 'user-staff';
const OUTSIDER = 'user-outsider';

type Row = Record<string, unknown>;
type Seed = { tenants: Row[]; admin_users: Row[] };

function tenant(id: string, slug: string, extra: Row = {}): Row {
  return {
    id,
    slug,
    name: `Chez ${slug}`,
    deleted_at: null,
    deleted_by: null,
    is_active: true,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...extra,
  };
}

function member(id: string, userId: string, tenantId: string, poste: string, extra: Row = {}): Row {
  return {
    id,
    user_id: userId,
    tenant_id: tenantId,
    postes: [poste],
    // Colonne de transition: ne sert plus qu'a reconnaitre une ligne de plateforme.
    role: null,
    email: `${userId}@example.com`,
    full_name: `Nom ${userId}`,
    phone: '+22670000000',
    ban_reason: null,
    is_active: true,
    is_super_admin: false,
    deleted_at: null,
    deleted_by: null,
    ...extra,
  };
}

function setup(seed: Seed, opts: { authError?: boolean } = {}) {
  const revoked: string[] = [];
  const { client, db } = createFakeSupabase(seed, {
    rpc: {
      revoke_user_sessions: (args) => {
        revoked.push(String(args.p_user_id));
        return { data: null, error: null };
      },
    },
  });
  const deleteUser = vi.fn(async () =>
    opts.authError ? { data: null, error: { message: 'boom' } } : { data: null, error: null },
  );
  const admin = Object.assign(client, {
    auth: { admin: { deleteUser } },
  }) as unknown as SupabaseClient;
  const cancel = vi.fn<(subscriptionId: string) => Promise<unknown>>(async () => ({}));
  const list = vi.fn<
    (params: { customer: string; status: 'all'; limit: number }) => Promise<{
      data: { id: string; status: string; metadata?: Record<string, string> | null }[];
    }>
  >(async () => ({ data: [] }));
  const service = createAccountDeletionService({
    admin,
    stripe: { subscriptions: { cancel, list } },
  });
  return { service, db, cancel, list, deleteUser, revoked };
}

async function expectServiceError(promise: Promise<unknown>, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).code).toBe(code);
}

const stripeError = (code: string) => Object.assign(new Error(code), { code });

describe('createAccountDeletionService.closeOwnerRestaurant', () => {
  let seed: Seed;

  beforeEach(() => {
    seed = {
      tenants: [
        tenant('t-a', 'alpha', { stripe_customer_id: 'cus_a', stripe_subscription_id: 'sub_a' }),
        tenant('t-b', 'beta'),
      ],
      admin_users: [
        member('m-1', OWNER, 't-a', 'owner'),
        member('m-2', OWNER, 't-b', 'owner'),
        member('m-3', STAFF, 't-a', 'waiter'),
      ],
    };
  });

  const close = (s: ReturnType<typeof setup>, extra: Partial<Row> = {}) =>
    s.service.closeOwnerRestaurant({
      userId: OWNER,
      tenantSlug: 'alpha',
      confirmation: 'Chez alpha',
      ...extra,
    } as { userId: string; tenantSlug: string; confirmation: string });

  it('cancels Stripe then closes ONLY the current restaurant', async () => {
    const s = setup(seed);
    const res = await close(s, { confirmation: '  chez ALPHA ' });

    expect(res).toEqual({ alreadyClosed: false });
    expect(s.cancel).toHaveBeenCalledWith('sub_a');
    const alpha = s.db.tenants.find((t) => t.id === 't-a');
    expect(alpha?.deleted_at).toEqual(expect.any(String));
    expect(alpha?.deleted_by).toBe(OWNER);
    expect(alpha?.is_active).toBe(false);
    // Le second restaurant du meme proprietaire reste ouvert.
    const beta = s.db.tenants.find((t) => t.id === 't-b');
    expect(beta?.deleted_at).toBeNull();
    expect(beta?.is_active).toBe(true);
  });

  it('cancels EVERY live subscription of the Stripe customer, not only the stored one', async () => {
    const s = setup(seed);
    s.list.mockResolvedValueOnce({
      data: [
        { id: 'sub_a', status: 'active' },
        { id: 'sub_trial', status: 'trialing' },
        { id: 'sub_late', status: 'past_due' },
        { id: 'sub_unpaid', status: 'unpaid' },
        { id: 'sub_old', status: 'canceled' },
        { id: 'sub_dead', status: 'incomplete_expired' },
      ],
    });
    await close(s);

    expect(s.list).toHaveBeenCalledWith({ customer: 'cus_a', status: 'all', limit: 100 });
    const cancelled = s.cancel.mock.calls.map(([id]) => id).sort();
    expect(cancelled).toEqual(['sub_a', 'sub_late', 'sub_trial', 'sub_unpaid']);
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toEqual(expect.any(String));
  });

  it('never cancels a subscription tagged for ANOTHER restaurant', async () => {
    const s = setup(seed);
    s.list.mockResolvedValueOnce({
      data: [
        { id: 'sub_a', status: 'active', metadata: { tenant_id: 't-b' } },
        { id: 'sub_mine', status: 'active', metadata: { tenant_id: 't-a' } },
        { id: 'sub_other', status: 'trialing', metadata: { tenant_id: 't-b' } },
        { id: 'sub_untagged', status: 'past_due', metadata: {} },
      ],
    });
    await close(s);
    const cancelled = s.cancel.mock.calls.map(([id]) => id).sort();
    // sub_a est l'identifiant stocke, mais Stripe le dit a t-b: on n'y touche pas.
    expect(cancelled).toEqual(['sub_mine', 'sub_untagged']);
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toEqual(expect.any(String));
  });

  it('closes when Stripe no longer knows the customer', async () => {
    const s = setup(seed);
    s.list.mockRejectedValueOnce(stripeError('resource_missing'));
    await close(s);
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toEqual(expect.any(String));
  });

  it('leaves the restaurant open when listing the subscriptions fails', async () => {
    const s = setup(seed);
    s.list.mockRejectedValueOnce(stripeError('api_error'));
    await expectServiceError(close(s), 'INTERNAL');
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toBeNull();
  });

  it('leaves the restaurant open when a cancellation fails', async () => {
    const s = setup(seed);
    s.cancel.mockRejectedValueOnce(stripeError('api_error'));
    await expectServiceError(close(s), 'INTERNAL');
    const alpha = s.db.tenants.find((t) => t.id === 't-a');
    expect(alpha?.deleted_at).toBeNull();
    expect(alpha?.is_active).toBe(true);
  });

  it('treats an already cancelled subscription (resource_missing) as success', async () => {
    const s = setup(seed);
    s.cancel.mockRejectedValueOnce(stripeError('resource_missing'));
    await close(s);
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toEqual(expect.any(String));
  });

  it('makes no Stripe call without a customer or a subscription', async () => {
    const s = setup(seed);
    await close(s, { tenantSlug: 'beta', confirmation: 'Chez beta' });
    expect(s.list).not.toHaveBeenCalled();
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants.find((t) => t.id === 't-b')?.deleted_at).toEqual(expect.any(String));
  });

  it('rejects a staff member on the owner path', async () => {
    const s = setup(seed);
    await expectServiceError(close(s, { userId: STAFF }), 'UNAUTHORIZED');
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toBeNull();
  });

  it('rejects a cross-tenant attempt', async () => {
    seed.tenants.push(tenant('t-c', 'gamma', { stripe_subscription_id: 'sub_c' }));
    const s = setup(seed);
    await expectServiceError(
      close(s, { tenantSlug: 'gamma', confirmation: 'Chez gamma' }),
      'UNAUTHORIZED',
    );
    await expectServiceError(close(s, { userId: OUTSIDER }), 'UNAUTHORIZED');
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants.every((t) => t.deleted_at === null)).toBe(true);
  });

  it('rejects a wrong confirmation before touching Stripe', async () => {
    const s = setup(seed);
    await expectServiceError(close(s, { confirmation: 'Chez beta' }), 'VALIDATION');
    expect(s.list).not.toHaveBeenCalled();
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants.find((t) => t.id === 't-a')?.deleted_at).toBeNull();
  });

  it('is idempotent on an already closed restaurant', async () => {
    seed.tenants[0] = { ...seed.tenants[0], deleted_at: '2026-11-01T00:00:00.000Z' };
    const s = setup(seed);
    const res = await close(s, { confirmation: 'anything' });
    expect(res).toEqual({ alreadyClosed: true });
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.db.tenants[0].deleted_at).toBe('2026-11-01T00:00:00.000Z');
  });

  it('returns NOT_FOUND for an unknown restaurant', async () => {
    const s = setup(seed);
    await expectServiceError(close(s, { tenantSlug: 'nope' }), 'NOT_FOUND');
  });
});

describe('createAccountDeletionService.deleteStaffAccount', () => {
  let seed: Seed;

  beforeEach(() => {
    seed = {
      tenants: [tenant('t-a', 'alpha'), tenant('t-b', 'beta')],
      admin_users: [
        member('m-1', OWNER, 't-a', 'owner'),
        member('m-3', STAFF, 't-a', 'waiter'),
        member('m-4', OUTSIDER, 't-b', 'chef'),
      ],
    };
  });

  const del = (s: ReturnType<typeof setup>, userId = STAFF, confirmation = ' supprimer ') =>
    s.service.deleteStaffAccount({ userId, confirmation });

  const anonymised = (row: Row | undefined) => {
    expect(row?.email).toBe(`anonymise-${String(row?.id)}@anonymise.invalid`);
    expect(row?.full_name).toBeNull();
    expect(row?.phone).toBeNull();
    expect(row?.is_active).toBe(false);
    expect(row?.deleted_at).toEqual(expect.any(String));
  };

  it('removes and anonymises every membership, then erases the auth user', async () => {
    seed.admin_users.push(member('m-5', STAFF, 't-b', 'cashier'));
    const s = setup(seed);
    await del(s);

    anonymised(s.db.admin_users.find((m) => m.id === 'm-3'));
    anonymised(s.db.admin_users.find((m) => m.id === 'm-5'));
    expect(s.db.admin_users.find((m) => m.id === 'm-3')?.deleted_by).toBe(STAFF);
    expect(s.revoked).toEqual([STAFF]);
    expect(s.deleteUser).toHaveBeenCalledWith(STAFF, true);
    // Personne d'autre n'est touche.
    expect(s.db.admin_users.find((m) => m.id === 'm-1')?.email).toBe(`${OWNER}@example.com`);
    expect(s.db.admin_users.find((m) => m.id === 'm-4')?.deleted_at).toBeNull();
    expect(s.db.tenants.every((t) => t.deleted_at === null)).toBe(true);
  });

  it('releases the tables still assigned to the deleted member, only theirs', async () => {
    const s = setup({
      ...seed,
      table_assignments: [
        { id: 'as-1', tenant_id: 't-a', server_id: 'm-3', ended_at: null },
        { id: 'as-2', tenant_id: 't-a', server_id: 'm-1', ended_at: null },
      ],
    } as Seed);
    await del(s);
    const rows = (s.db as Record<string, Row[]>).table_assignments;
    expect(rows.find((r) => r.id === 'as-1')?.ended_at).toEqual(expect.any(String));
    expect(rows.find((r) => r.id === 'as-2')?.ended_at).toBeNull();
  });

  it('keeps ban_reason: it is a ban record, not contact data', async () => {
    seed.admin_users[1] = { ...seed.admin_users[1], ban_reason: 'vol de caisse' };
    const s = setup(seed);
    await del(s);
    const row = s.db.admin_users.find((m) => m.id === 'm-3');
    anonymised(row);
    expect(row?.ban_reason).toBe('vol de caisse');
  });

  it('accepts the English word and works without any e-mail', async () => {
    seed.admin_users[1] = { ...seed.admin_users[1], email: '' };
    const s = setup(seed);
    await del(s, STAFF, 'DELETE');
    expect(s.deleteUser).toHaveBeenCalledWith(STAFF, true);
  });

  it('rejects a wrong confirmation word', async () => {
    const s = setup(seed);
    await expectServiceError(del(s, STAFF, 'staff@example.com'), 'VALIDATION');
    expect(s.db.admin_users.find((m) => m.id === 'm-3')?.deleted_at).toBeNull();
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  it('blocks the owner of an open restaurant', async () => {
    const s = setup(seed);
    await expectServiceError(del(s, OWNER), 'CONFLICT');
    expect(s.db.admin_users.find((m) => m.id === 'm-1')?.deleted_at).toBeNull();
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  it('lets an owner whose restaurant is already CLOSED delete the account', async () => {
    // t-a est vraiment ferme dans la table des restaurants: c'est la jointure
    // `tenants!inner(deleted_at)` qui doit le voir, pas une cle mise a plat.
    seed.tenants[0] = { ...seed.tenants[0], deleted_at: '2026-11-10T00:00:00.000Z' };
    seed.admin_users.push(member('m-6', OWNER, 't-b', 'manager'));
    const s = setup(seed);
    await del(s, OWNER);
    anonymised(s.db.admin_users.find((m) => m.id === 'm-1'));
    anonymised(s.db.admin_users.find((m) => m.id === 'm-6'));
    expect(s.deleteUser).toHaveBeenCalledWith(OWNER, true);
  });

  it('never erases a platform account, whatever the state of its rows', async () => {
    // Ligne super-admin supprimee, dans un restaurant ferme: elle garde le compte
    // (meme predicat que closed_tenant_auth_users).
    seed.tenants[1] = { ...seed.tenants[1], deleted_at: '2026-11-10T00:00:00.000Z' };
    seed.admin_users.push(
      member('m-7', STAFF, 't-b', 'manager', {
        is_super_admin: true,
        deleted_at: '2026-11-11T00:00:00.000Z',
      }),
    );
    const s = setup(seed);
    await expectServiceError(del(s), 'UNAUTHORIZED');
    expect(s.db.admin_users.find((m) => m.id === 'm-3')?.deleted_at).toBeNull();
    expect(s.deleteUser).not.toHaveBeenCalled();

    seed.admin_users[3] = { ...seed.admin_users[3], is_super_admin: false, role: 'super_admin' };
    const s2 = setup(seed);
    await expectServiceError(del(s2), 'UNAUTHORIZED');
    expect(s2.deleteUser).not.toHaveBeenCalled();
  });

  it('is idempotent: a retry after a failed auth deletion finishes the job', async () => {
    const first = setup(seed, { authError: true });
    await expectServiceError(del(first), 'INTERNAL');
    const deletedAt = first.db.admin_users.find((m) => m.id === 'm-3')?.deleted_at;
    expect(deletedAt).toEqual(expect.any(String));

    const second = setup({ tenants: first.db.tenants, admin_users: first.db.admin_users });
    await del(second);
    expect(second.deleteUser).toHaveBeenCalledWith(STAFF, true);
    // La date de retrait d'origine n'est pas reecrite.
    expect(second.db.admin_users.find((m) => m.id === 'm-3')?.deleted_at).toBe(deletedAt);
  });
});
