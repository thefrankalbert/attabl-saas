import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderService } from '../order.service';
import { STALE_PAID_ORDER_MS } from '../order/order-lifecycle';

// Owner decision 2026-11-15 (market usage): a table stays occupied while its
// order is in progress, even paid; staff can free it by hand, refused while
// money is due; a paid table frees itself after a delay.
//
// The check-and-close runs in ONE locked database function
// (close_table_session_if_settled); its rule is proven against Postgres by
// supabase/tests/rls/fermeture_table_verrouillee.test.sql. Here: which session
// the service hands it, with which arguments, and how the answer is reported.

type Call = { table: string; method: string; args: unknown[] };

function makeClient(results: { sessions?: unknown[]; outcome?: string }) {
  const calls: Call[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'lt']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: results.sessions ?? [], error: null });
    return chain;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: results.outcome ?? 'closed', error: null };
  };
  return { client: { from, rpc } as unknown as SupabaseClient, calls, rpcCalls };
}

describe('releaseTableSession ("Liberer la table")', () => {
  it('asks for a money-only close of the open session, tenant-scoped', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], outcome: 'closed' });
    await createOrderService(m.client).releaseTableSession('t1', '5', 'Salle 5');

    // The session is found by number OR display name (older sessions).
    expect(m.calls).toContainEqual({
      table: 'table_sessions',
      method: 'in',
      args: ['table_number', ['5', 'Salle 5']],
    });
    expect(m.calls).toContainEqual({
      table: 'table_sessions',
      method: 'eq',
      args: ['tenant_id', 't1'],
    });
    expect(m.rpcCalls).toEqual([
      {
        fn: 'close_table_session_if_settled',
        args: { p_session_id: 's1', p_tenant_id: 't1', p_require_served: false },
      },
    ]);
  });

  it('refuses while money is still due on the table (witness)', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], outcome: 'unsettled' });
    await expect(createOrderService(m.client).releaseTableSession('t1', '5')).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
  });

  it('says so when the table is already free (no false "freed")', async () => {
    const m = makeClient({ sessions: [] });
    await expect(createOrderService(m.client).releaseTableSession('t1', '5')).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
    expect(m.rpcCalls).toHaveLength(0);
  });

  it('a session closed meanwhile by someone else is reported as already free', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }], outcome: 'not_open' });
    await expect(createOrderService(m.client).releaseTableSession('t1', '5')).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
  });
});

describe('releaseStaleSessions (automatic release)', () => {
  it('re-checks each table open longer than the delay, with the stale cutoff', async () => {
    const m = makeClient({ sessions: [{ id: 's1' }, { id: 's2' }] });
    await createOrderService(m.client).releaseStaleSessions('t1');

    const lt = m.calls.find((c) => c.method === 'lt')!;
    expect(lt.args[0]).toBe('opened_at');
    const openedBefore = new Date(lt.args[1] as string).getTime();
    expect(Math.abs(Date.now() - STALE_PAID_ORDER_MS - openedBefore)).toBeLessThan(5_000);
    expect(m.calls).toContainEqual({
      table: 'table_sessions',
      method: 'eq',
      args: ['tenant_id', 't1'],
    });
    expect(m.rpcCalls.map((c) => c.args.p_session_id)).toEqual(['s1', 's2']);
    for (const c of m.rpcCalls) {
      expect(c.fn).toBe('close_table_session_if_settled');
      expect(c.args.p_tenant_id).toBe('t1');
      expect(typeof c.args.p_stale_before).toBe('string');
    }
  });

  it('touches nothing when no table is stale (witness)', async () => {
    const m = makeClient({ sessions: [] });
    await createOrderService(m.client).releaseStaleSessions('t1');
    expect(m.rpcCalls).toHaveLength(0);
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
