import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const envoyer = vi.hoisted(() => vi.fn());
vi.mock('@/services/push.service', () => ({
  createPushService: () => ({ envoyerAuxAppareilsDuTenant: envoyer }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createOrderReadyService } from '../order-ready.service';
import { logger } from '@/lib/logger';

type Row = Record<string, unknown> | null;
let rows: Record<string, Row>;
let filters: Record<string, [string, unknown][]>;

/** Each table answers one fixed row to `.maybeSingle()`; filters are recorded. */
function fakeDb(): SupabaseClient {
  return {
    from: (table: string) => {
      filters[table] = [];
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => (filters[table].push([c, v]), chain),
        is: (c: string, v: unknown) => (filters[table].push([c, v]), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const T = 'tenant-a';

describe('createOrderReadyService.notifyReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filters = {};
    rows = {
      orders: { order_number: 'CMD-7', table_number: '4', server_id: 'srv-1', table_id: 'tb-1' },
      table_assignments: { server_id: 'srv-2' },
      tenants: { slug: 'mon-resto' },
    };
  });

  it('notifies the order taker AND the server assigned to the table, nobody else', async () => {
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-1');

    expect(envoyer).toHaveBeenCalledTimes(1);
    const [tenant, charge, dest] = envoyer.mock.calls[0];
    expect(tenant).toBe(T);
    expect(dest).toEqual({ membres: ['srv-1', 'srv-2'] });
    expect(charge).toMatchObject({
      titre: 'Commande prête - Table 4',
      tag: 'prete-o-1',
      url: '/service',
      slug: 'mon-resto',
    });
  });

  it('scopes every lookup to the tenant and only the ACTIVE assignment', async () => {
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-1');

    expect(filters.orders).toContainEqual(['tenant_id', T]);
    expect(filters.table_assignments).toContainEqual(['tenant_id', T]);
    expect(filters.table_assignments).toContainEqual(['ended_at', null]);
  });

  it('same person on both sides is notified once', async () => {
    rows.table_assignments = { server_id: 'srv-1' };
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-1');
    expect(envoyer.mock.calls[0][2]).toEqual({ membres: ['srv-1'] });
  });

  it('customer QR order (no taker, no table server): no push at all', async () => {
    rows.orders = { order_number: 'CMD-8', table_number: '2', server_id: null, table_id: 'tb-2' };
    rows.table_assignments = null;
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-2');
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('order without table: title shows the order number', async () => {
    rows.orders = { order_number: 'CMD-9', table_number: null, server_id: 'srv-1', table_id: null };
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-3');
    expect(envoyer.mock.calls[0][1].titre).toBe('Commande prête - CMD-9');
  });

  it('order of another tenant (not found): no push', async () => {
    rows.orders = null;
    await createOrderReadyService(fakeDb()).notifyReady(T, 'o-x');
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('never throws: a failing push is logged, the kitchen action stays green', async () => {
    envoyer.mockRejectedValueOnce(new Error('boom'));
    await expect(createOrderReadyService(fakeDb()).notifyReady(T, 'o-1')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
