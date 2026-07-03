import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderAnnotationService } from '../order-annotation.service';

const TENANT = 'tenant-1';
const ORDER = 'order-1';
const ACCOUNT = 'account-1';

/**
 * Records the from()/insert()/update()/select() call shapes the annotation
 * service uses, so tenant/order scoping and the verify-before-attach step can be
 * asserted against an in-memory double.
 */
function createMock(
  opts: {
    accountRow?: { id: string } | null;
    insertReturn?: Record<string, unknown>;
    listRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const calls = {
    noteInsert: null as Record<string, unknown> | null,
    orderUpdate: null as Record<string, unknown> | null,
    orderUpdateEqs: [] as Array<[string, unknown]>,
    accountLookupEqs: [] as Array<[string, unknown]>,
    listEqs: [] as Array<[string, unknown]>,
    houseUpdate: null as Record<string, unknown> | null,
  };

  const from = vi.fn((table: string) => {
    if (table === 'order_notes') {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          calls.noteInsert = row;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: opts.insertReturn ?? {
                  id: 'note-1',
                  note: row.note,
                  created_at: '2026-07-03T10:00:00Z',
                  created_by: row.created_by,
                  author: { full_name: 'Amadou' },
                },
                error: null,
              })),
            })),
          };
        }),
        select: vi.fn(() => {
          const b: Record<string, unknown> = {};
          b.eq = vi.fn((col: string, val: unknown) => {
            calls.listEqs.push([col, val]);
            return b;
          });
          b.order = vi.fn(async () => ({ data: opts.listRows ?? [], error: null }));
          return b;
        }),
      };
    }
    if (table === 'house_accounts') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: ACCOUNT }, error: null })),
          })),
        })),
        select: vi.fn(() => {
          const b: Record<string, unknown> = {};
          b.eq = vi.fn((col: string, val: unknown) => {
            calls.accountLookupEqs.push([col, val]);
            return b;
          });
          b.maybeSingle = vi.fn(async () => ({
            data: opts.accountRow === undefined ? { id: ACCOUNT } : opts.accountRow,
            error: null,
          }));
          return b;
        }),
        update: vi.fn((patch: Record<string, unknown>) => {
          calls.houseUpdate = patch;
          const b: Record<string, unknown> = {};
          b.eq = vi.fn(async () => ({ error: null }));
          // chain: .eq().eq()
          b.eq = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
          return b;
        }),
      };
    }
    if (table === 'orders') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          calls.orderUpdate = patch;
          // .update(patch).eq('id').eq('tenant_id') is awaited; a plain (non-
          // thenable) object resolves to itself so `const { error } = await ...`
          // yields undefined (no error).
          const b: Record<string, unknown> = { error: null };
          b.eq = vi.fn((col: string, val: unknown) => {
            calls.orderUpdateEqs.push([col, val]);
            return b;
          });
          return b;
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return { from, _calls: calls };
}

function asSupabase(m: unknown): SupabaseClient {
  return m as SupabaseClient;
}

describe('createOrderAnnotationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('addOrderNote inserts { tenant_id, order_id, note, created_by }', async () => {
    const mock = createMock();
    const svc = createOrderAnnotationService(asSupabase(mock));

    const note = await svc.addOrderNote(ORDER, TENANT, { note: 'RAS', createdBy: 'admin-3' });

    expect(mock._calls.noteInsert).toMatchObject({
      tenant_id: TENANT,
      order_id: ORDER,
      note: 'RAS',
      created_by: 'admin-3',
    });
    expect(note.authorName).toBe('Amadou');
  });

  it('listOrderNotes scopes by tenant_id + order_id', async () => {
    const mock = createMock({ listRows: [] });
    const svc = createOrderAnnotationService(asSupabase(mock));

    await svc.listOrderNotes(ORDER, TENANT);

    expect(mock._calls.listEqs).toContainEqual(['tenant_id', TENANT]);
    expect(mock._calls.listEqs).toContainEqual(['order_id', ORDER]);
  });

  it('attachOrderToHouseAccount verifies the account tenant before updating', async () => {
    const mock = createMock({ accountRow: { id: ACCOUNT } });
    const svc = createOrderAnnotationService(asSupabase(mock));

    await svc.attachOrderToHouseAccount(ORDER, TENANT, ACCOUNT);

    // The account was looked up scoped by id + tenant_id BEFORE the order update.
    expect(mock._calls.accountLookupEqs).toContainEqual(['id', ACCOUNT]);
    expect(mock._calls.accountLookupEqs).toContainEqual(['tenant_id', TENANT]);
    expect(mock._calls.orderUpdate).toMatchObject({ house_account_id: ACCOUNT });
    expect(mock._calls.orderUpdateEqs).toContainEqual(['tenant_id', TENANT]);
  });

  it('attachOrderToHouseAccount throws NOT_FOUND for a foreign account', async () => {
    const mock = createMock({ accountRow: null });
    const svc = createOrderAnnotationService(asSupabase(mock));

    await expect(svc.attachOrderToHouseAccount(ORDER, TENANT, ACCOUNT)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // No order update happened.
    expect(mock._calls.orderUpdate).toBeNull();
  });

  it('settleHouseAccount sets status settled + settled_by', async () => {
    const mock = createMock();
    const svc = createOrderAnnotationService(asSupabase(mock));

    await svc.settleHouseAccount(ACCOUNT, TENANT, { settledBy: 'admin-9' });

    expect(mock._calls.houseUpdate).toMatchObject({ status: 'settled', settled_by: 'admin-9' });
    expect(mock._calls.houseUpdate?.settled_at).toBeTruthy();
  });
});
