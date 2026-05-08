import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyOrangeMoneyCallback = vi.fn();
const mockInsert = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockSelectSingle = vi.fn();
const mockSelectEq = vi.fn(() => ({ single: mockSelectSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));

vi.mock('@/lib/orange-money/client', () => ({
  verifyOrangeMoneyCallback: (...args: unknown[]) => mockVerifyOrangeMoneyCallback(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'orange_money_events') {
        return { insert: mockInsert };
      }
      if (table === 'orders') {
        return { select: mockSelect, update: mockUpdate };
      }
      return {};
    }),
  })),
}));

describe('POST /api/orange-money/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyOrangeMoneyCallback.mockReturnValue(true);
    mockSelectSingle.mockResolvedValue({
      data: {
        id: 'order-1',
        total: 5000,
        payment_status: 'pending',
        payment_method: 'orange_money',
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdateEq.mockResolvedValue({ error: null });
  });

  it('returns 400 when body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        body: 'not-json',
      }),
    );

    const json = (await response.json()) as { error: string };
    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid JSON');
  });

  it('returns 400 when callback payload shape is invalid', async () => {
    mockVerifyOrangeMoneyCallback.mockReturnValue(false);

    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      }),
    );

    const json = (await response.json()) as { error: string };
    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid payload');
  });

  it('returns 200 and ignores non-success payment status', async () => {
    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'FAILED',
          orderId: 'order-1',
          txnid: 'txn-failed',
          amount: '5000',
        }),
      }),
    );

    const json = (await response.json()) as { received: boolean };
    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 on duplicate event id (idempotent replay)', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          orderId: 'order-1',
          txnid: 'txn-dup',
          amount: '5000',
        }),
      }),
    );

    const json = (await response.json()) as { received: boolean };
    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it('marks order as paid on SUCCESS callback', async () => {
    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUCCESS',
          orderId: 'order-1',
          txnid: 'txn-1',
          amount: '5000',
        }),
      }),
    );

    const json = (await response.json()) as { received: boolean };
    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        payment_method: 'orange_money',
      }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'order-1');
  });
});
