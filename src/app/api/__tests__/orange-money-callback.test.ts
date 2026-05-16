import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyOrangeMoneyCallback = vi.fn();
const mockVerifyOrangeMoneyNotifToken = vi.fn();
const mockVerifyOrangeMoneyWebhookSignature = vi.fn();
const mockGetOrangeMoneyTransactionStatus = vi.fn();
const mockWebhookLimiterCheck = vi.fn();
const mockInsert = vi.fn();
const mockUpdateEqPending = vi.fn();
const mockUpdateEqId = vi.fn(() => ({ eq: mockUpdateEqPending }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEqId }));
const mockSelectSingle = vi.fn();
const mockSelectEq = vi.fn(() => ({ single: mockSelectSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));

vi.mock('@/lib/orange-money/client', () => ({
  verifyOrangeMoneyCallback: (...args: unknown[]) => mockVerifyOrangeMoneyCallback(...args),
  verifyOrangeMoneyNotifToken: (...args: unknown[]) => mockVerifyOrangeMoneyNotifToken(...args),
  verifyOrangeMoneyWebhookSignature: (...args: unknown[]) =>
    mockVerifyOrangeMoneyWebhookSignature(...args),
  getOrangeMoneyTransactionStatus: (...args: unknown[]) =>
    mockGetOrangeMoneyTransactionStatus(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  webhookLimiter: { check: (...args: unknown[]) => mockWebhookLimiterCheck(...args) },
  getClientIp: vi.fn(() => '127.0.0.1'),
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

const validPayload = {
  status: 'SUCCESS',
  orderId: 'order-1',
  txnid: 'txn-1',
  amount: '5000',
  notif_token: 'notif-secret',
};

describe('POST /api/orange-money/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockWebhookLimiterCheck.mockResolvedValue({ success: true });
    mockVerifyOrangeMoneyWebhookSignature.mockReturnValue(true);
    mockVerifyOrangeMoneyCallback.mockReturnValue(true);
    mockVerifyOrangeMoneyNotifToken.mockReturnValue(true);
    mockGetOrangeMoneyTransactionStatus.mockResolvedValue({ status: 'SUCCESS' });
    mockSelectSingle.mockResolvedValue({
      data: {
        id: 'order-1',
        total: 5000,
        payment_status: 'pending',
        payment_method: 'orange_money',
        orange_money_pay_token: 'pay-token',
        orange_money_notif_token: 'notif-secret',
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdateEqPending.mockResolvedValue({ error: null });
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

  it('returns 401 when signature verification fails', async () => {
    mockVerifyOrangeMoneyWebhookSignature.mockReturnValue(false);

    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      }),
    );

    const json = (await response.json()) as { error: string };
    expect(response.status).toBe(401);
    expect(json.error).toBe('Invalid signature');
  });

  it('returns 401 when notif_token does not match stored token', async () => {
    mockVerifyOrangeMoneyNotifToken.mockReturnValue(false);

    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      }),
    );

    const json = (await response.json()) as { error: string };
    expect(response.status).toBe(401);
    expect(json.error).toBe('Invalid notification token');
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
        body: JSON.stringify(validPayload),
      }),
    );

    const json = (await response.json()) as { received: boolean };
    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
  });

  it('marks order as paid on verified SUCCESS callback', async () => {
    const { POST } = await import('@/app/api/orange-money/callback/route');
    const response = await POST(
      new Request('http://localhost/api/orange-money/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      }),
    );

    const json = (await response.json()) as { received: boolean };
    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockGetOrangeMoneyTransactionStatus).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        payment_method: 'orange_money',
      }),
    );
    expect(mockUpdateEqId).toHaveBeenCalledWith('id', 'order-1');
    expect(mockUpdateEqPending).toHaveBeenCalledWith('payment_status', 'pending');
  });
});
