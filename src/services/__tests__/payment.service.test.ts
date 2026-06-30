import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaymentService } from '../payment.service';
import { ServiceError } from '../errors';

// Mock the logger to avoid Sentry imports in tests.
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// order.service is imported by payment.service for closeSessionIfFullySettled.
// Stub it so the one-way import does not pull the real DB-coupled logic.
vi.mock('../order.service', () => ({
  createOrderService: () => ({
    closeSessionIfFullySettled: vi.fn().mockResolvedValue(undefined),
  }),
}));

type LedgerRow = {
  id: string;
  amount: number;
  method: string;
  status: 'completed' | 'refunded';
  created_by: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  total: number;
  tip_amount: number;
  display_currency: string | null;
  payment_status: string;
  paid_at: string | null;
  session_id: string | null;
  status: string;
};

/**
 * In-memory Supabase test double for the call shapes payment.service uses:
 *  - from('orders').select(cols).eq().eq().maybeSingle()
 *  - from('orders').update(obj).eq().eq()
 *  - from('payments').select(cols).eq().eq().order()
 *  - from('payments').insert(obj)
 */
function createMockSupabase(order: OrderRow, ledger: LedgerRow[] = []) {
  let seq = ledger.length;

  function selectBuilder(rows: () => unknown[]) {
    // Terminal-or-chainable on .eq, terminal on .maybeSingle / .order.
    const builder = {
      eq: vi.fn(() => builder),
      order: vi.fn(async () => ({ data: rows(), error: null })),
      maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    };
    return builder;
  }

  const from = vi.fn((table: string) => {
    if (table === 'orders') {
      return {
        select: vi.fn(() => selectBuilder(() => [order])),
        update: vi.fn((patch: Partial<OrderRow>) => {
          const apply = { eq: vi.fn() };
          // update().eq().eq() resolves; mutate the in-memory order on the last eq.
          apply.eq = vi.fn(() => ({
            eq: vi.fn(async () => {
              Object.assign(order, patch);
              return { error: null };
            }),
          }));
          return apply;
        }),
      };
    }
    if (table === 'payments') {
      return {
        select: vi.fn(() => selectBuilder(() => ledger)),
        insert: vi.fn(async (row: Omit<LedgerRow, 'id' | 'created_at'>) => {
          seq += 1;
          ledger.push({
            id: `pay-${seq}`,
            amount: row.amount,
            method: row.method,
            status: row.status,
            created_by: row.created_by ?? null,
            created_at: new Date(2026, 5, 30, 12, 0, seq).toISOString(),
          });
          return { error: null };
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return { from, _order: order, _ledger: ledger };
}

function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

const TENANT = 'tenant-1';
const ORDER_ID = 'order-1';

function baseOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  // XAF is zero-decimal: amounts are whole numbers.
  return {
    id: ORDER_ID,
    total: 10000,
    tip_amount: 0,
    display_currency: 'XAF',
    payment_status: 'pending',
    paid_at: null,
    session_id: null,
    status: 'ready',
    ...overrides,
  };
}

describe('createPaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordTender partial then completing -> partial then paid', async () => {
    const mock = createMockSupabase(baseOrder());
    const service = createPaymentService(asSupabase(mock));

    const first = await service.recordTender(ORDER_ID, TENANT, {
      amount: 4000,
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(first.paymentStatus).toBe('partial');
    expect(first.net).toBe(4000);
    expect(first.due).toBe(10000);
    expect(mock._order.payment_status).toBe('partial');

    const second = await service.recordTender(ORDER_ID, TENANT, {
      amount: 6000,
      method: 'card',
      createdBy: 'admin-1',
    });
    expect(second.paymentStatus).toBe('paid');
    expect(second.net).toBe(10000);
    expect(mock._order.payment_status).toBe('paid');
    expect(mock._order.status).toBe('delivered');
    expect(mock._order.paid_at).not.toBeNull();
  });

  it('refund full -> refunded', async () => {
    const mock = createMockSupabase(baseOrder({ payment_status: 'paid', paid_at: 'x' }), [
      {
        id: 'pay-1',
        amount: 10000,
        method: 'cash',
        status: 'completed',
        created_by: 'admin-1',
        created_at: '2026-06-30T11:00:00.000Z',
      },
    ]);
    const service = createPaymentService(asSupabase(mock));

    const summary = await service.refund(ORDER_ID, TENANT, {
      amount: 10000,
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(summary.paymentStatus).toBe('refunded');
    expect(summary.net).toBe(0);
    expect(summary.refunded).toBe(10000);
    expect(mock._order.payment_status).toBe('refunded');
  });

  it('partial refund after paid -> partial', async () => {
    const mock = createMockSupabase(baseOrder({ payment_status: 'paid', paid_at: 'x' }), [
      {
        id: 'pay-1',
        amount: 10000,
        method: 'cash',
        status: 'completed',
        created_by: 'admin-1',
        created_at: '2026-06-30T11:00:00.000Z',
      },
    ]);
    const service = createPaymentService(asSupabase(mock));

    const summary = await service.refund(ORDER_ID, TENANT, {
      amount: 3000,
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(summary.paymentStatus).toBe('partial');
    expect(summary.net).toBe(7000);
    expect(mock._order.payment_status).toBe('partial');
  });

  it('over-refund (amount > net) -> ServiceError VALIDATION', async () => {
    const mock = createMockSupabase(baseOrder({ payment_status: 'paid', paid_at: 'x' }), [
      {
        id: 'pay-1',
        amount: 10000,
        method: 'cash',
        status: 'completed',
        created_by: 'admin-1',
        created_at: '2026-06-30T11:00:00.000Z',
      },
    ]);
    const service = createPaymentService(asSupabase(mock));

    await expect(
      service.refund(ORDER_ID, TENANT, { amount: 12000, method: 'cash', createdBy: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mock._ledger).toHaveLength(1); // no offsetting row inserted
  });

  it('recordTender on cancelled order -> CONFLICT', async () => {
    const mock = createMockSupabase(baseOrder({ status: 'cancelled' }));
    const service = createPaymentService(asSupabase(mock));

    await expect(
      service.recordTender(ORDER_ID, TENANT, {
        amount: 5000,
        method: 'cash',
        createdBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mock._ledger).toHaveLength(0);
  });

  it('recordTender amount <= 0 -> VALIDATION', async () => {
    const mock = createMockSupabase(baseOrder());
    const service = createPaymentService(asSupabase(mock));

    await expect(
      service.recordTender(ORDER_ID, TENANT, { amount: 0, method: 'cash', createdBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      service.recordTender(ORDER_ID, TENANT, {
        amount: -100,
        method: 'cash',
        createdBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('EUR order in minor units: due = total + tip; partial then paid', async () => {
    // EUR is 2-decimal. An order of 10.00 EUR + 2.50 EUR tip is stored as minor
    // units: total=1000, tip_amount=250. due must be 1250 (plain integer add).
    const mock = createMockSupabase(
      baseOrder({ display_currency: 'EUR', total: 1000, tip_amount: 250 }),
    );
    const service = createPaymentService(asSupabase(mock));

    const first = await service.recordTender(ORDER_ID, TENANT, {
      amount: 1000, // 10.00 EUR tendered (minor)
      method: 'card',
      createdBy: 'admin-1',
    });
    expect(first.due).toBe(1250);
    expect(first.net).toBe(1000);
    expect(first.paymentStatus).toBe('partial');

    const second = await service.recordTender(ORDER_ID, TENANT, {
      amount: 250, // remaining 2.50 EUR (minor)
      method: 'cash',
      createdBy: 'admin-1',
    });
    expect(second.net).toBe(1250);
    expect(second.paymentStatus).toBe('paid');
    expect(mock._order.payment_status).toBe('paid');
  });

  it('refund amount <= 0 -> VALIDATION', async () => {
    const mock = createMockSupabase(baseOrder({ payment_status: 'paid' }), [
      {
        id: 'pay-1',
        amount: 10000,
        method: 'cash',
        status: 'completed',
        created_by: 'admin-1',
        created_at: '2026-06-30T11:00:00.000Z',
      },
    ]);
    const service = createPaymentService(asSupabase(mock));

    await expect(
      service.refund(ORDER_ID, TENANT, { amount: 0, method: 'cash', createdBy: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
