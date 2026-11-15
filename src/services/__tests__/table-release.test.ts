import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderService } from '../order.service';
import { STALE_PAID_ORDER_MS } from '../order/order-lifecycle';

// Owner decision 2026-11-15 (market usage): a table stays occupied while its
// order is in progress, even paid; staff can free it by hand, refused while
// money is due; a paid table frees itself after a delay.

type Call = { table: string; method: string; args: unknown[] };

/**
 * Recording client: every chained call is logged; awaiting a chain resolves
 * with the result configured for its table (and operation: select / update).
 */
function makeClient(results: { sessions?: unknown[]; unpaid?: number; settling?: number }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let op = 'select';
    let isCount = false;
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'lt', 'or', 'update']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'update') op = 'update';
        if (method === 'select' && (args[1] as { count?: string } | undefined)?.count) {
          isCount = true;
        }
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => {
      if (op === 'update') return resolve({ error: null });
      if (table === 'table_sessions') return resolve({ data: results.sessions ?? [], error: null });
      // orders: the manual release counts unpaid orders (`in`), the automatic
      // close counts unsettled ones (`or`).
      const usesOr = calls.some((c) => c.table === 'orders' && c.method === 'or');
      return resolve({
        count: isCount ? (usesOr ? (results.settling ?? 0) : (results.unpaid ?? 0)) : 0,
        error: null,
      });
    };
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const updates = (calls: Call[]) =>
  calls.filter((c) => c.table === 'table_sessions' && c.method === 'update');

describe('releaseTableSession ("Liberer la table")', () => {
  it('frees a paid table, served or not, scoped to the tenant everywhere', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], unpaid: 0 });
    await createOrderService(m.client).releaseTableSession('t1', '5', 'Salle 5');

    expect(updates(m.calls)).toHaveLength(1);
    // The session is found by number OR display name (older sessions).
    expect(m.calls).toContainEqual({
      table: 'table_sessions',
      method: 'in',
      args: ['table_number', ['5', 'Salle 5']],
    });
    // Money still due = pending AND partial.
    expect(m.calls).toContainEqual({
      table: 'orders',
      method: 'in',
      args: ['payment_status', ['pending', 'partial']],
    });
    const tenantFilters = m.calls.filter((c) => c.method === 'eq' && c.args[0] === 'tenant_id');
    expect(tenantFilters.every((c) => c.args[1] === 't1')).toBe(true);
    // Every table touched (session read, order count, close) is tenant-filtered.
    expect(new Set(tenantFilters.map((c) => c.table))).toEqual(
      new Set(['table_sessions', 'orders']),
    );
    expect(tenantFilters.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses while money is still due on the table (witness)', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], unpaid: 1 });
    await expect(createOrderService(m.client).releaseTableSession('t1', '5')).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
    expect(updates(m.calls)).toHaveLength(0);
  });

  it('says so when the table is already free (no false "freed")', async () => {
    const m = makeClient({ sessions: [] });
    await expect(createOrderService(m.client).releaseTableSession('t1', '5')).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
    expect(updates(m.calls)).toHaveLength(0);
  });
});

describe('releaseStaleSessions (automatic release)', () => {
  it('closes a stale table whose orders are all settled', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], settling: 0 });
    await createOrderService(m.client).releaseStaleSessions('t1');

    // Only tables open longer than the delay are looked at.
    const lt = m.calls.find((c) => c.method === 'lt')!;
    const cutoff = new Date(lt.args[1] as string).getTime();
    expect(Math.abs(Date.now() - STALE_PAID_ORDER_MS - cutoff)).toBeLessThan(5_000);
    // The settlement check treats a paid order older than the delay as served.
    const or = m.calls.find((c) => c.table === 'orders' && c.method === 'or')!;
    expect(or.args[0]).toMatch(/payment_status\.in\.\(pending,partial\)/);
    expect(or.args[0]).toMatch(
      /and\(status\.not\.in\.\(delivered,served\),created_at\.gt\."[^"]+"\)/,
    );
    expect(updates(m.calls)).toHaveLength(1);
  });

  it('keeps a stale table open while something is still unsettled (witness)', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], settling: 1 });
    await createOrderService(m.client).releaseStaleSessions('t1');
    expect(updates(m.calls)).toHaveLength(0);
  });

  it("checks only the order's own table when one is given", async () => {
    const m = makeClient({ sessions: [] });
    await createOrderService(m.client).releaseStaleSessions('t1', '7');
    expect(m.calls).toContainEqual({
      table: 'table_sessions',
      method: 'eq',
      args: ['table_number', '7'],
    });
  });
});
