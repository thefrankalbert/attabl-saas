import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  checkoutLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/stripe/server', () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
  getStripePriceId: vi.fn().mockReturnValue('price_test'),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/billing/stale-subscription', () => ({
  retrieveStripeSubscriptionStatus: vi.fn(),
  clearStaleSubscriptionId: vi.fn(),
}));
vi.mock('@/lib/billing/expire-open-checkouts', () => ({ expireOtherOpenCheckouts: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

const resolveCheckoutTenant = vi.fn();
vi.mock('@/lib/billing/checkout-tenant', () => ({
  resolveCheckoutTenant: (...a: unknown[]) => resolveCheckoutTenant(...a),
}));

const refuse = vi.fn(async (): Promise<Response | null> => null);
vi.mock('@/lib/billing/flutterwave/guard', () => ({ refuseIfPaidByFlutterwave: () => refuse() }));

import { POST } from '../create-embedded-checkout/route';
import { stripe } from '@/lib/stripe/server';

const req = () =>
  new Request('http://localhost:3000/api/create-embedded-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'pro' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resolveCheckoutTenant.mockResolvedValue({
    ok: true,
    userId: 'u',
    email: 'a@b.co',
    tenant: { tenant_id: 't1', tenants: null },
  });
});

describe('POST /api/create-embedded-checkout: garde Flutterwave', () => {
  it('refuse (409) un restaurant deja paye par Flutterwave, sans session Stripe', async () => {
    refuse.mockResolvedValueOnce(
      Response.json({ code: 'EXISTING_FLUTTERWAVE_SUBSCRIPTION' }, { status: 409 }),
    );
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('temoin positif: la garde ne refuse pas, la route va jusqu a Stripe', async () => {
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_1',
      client_secret: 'secret',
    } as never);
    const res = await POST(req());
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
