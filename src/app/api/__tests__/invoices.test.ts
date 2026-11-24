import { describe, it, expect, vi, beforeEach } from 'vitest';

// B1 (revue ligne par ligne, lot B2b-2): la page des factures exige `settings.view`,
// la route ne controlait que le role. Un administrateur a qui le proprietaire a
// retire ce droit lisait encore les factures Stripe par un appel direct.

vi.mock('@/lib/rate-limit', () => ({
  checkoutLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/stripe/server', () => ({ stripe: { invoices: { list: vi.fn() } } }));
vi.mock('@/lib/stripe/circuit-breaker', () => ({
  withStripeBreaker: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/cache', () => ({ getTenant: vi.fn() }));
vi.mock('@/lib/billing/tenant-billing-ids', () => ({ getTenantBillingIds: vi.fn() }));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({ resolveAdminPermission: vi.fn() }));

import { GET } from '../invoices/route';
import { checkoutLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';
import { resolveAdminPermission } from '@/lib/auth/resolve-admin-permission';

function supabaseWithMember(role: string) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { role }, error: null });
  const chain = { eq: vi.fn(), maybeSingle };
  chain.eq.mockReturnValue(chain);
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }),
  };
}

describe('GET /api/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkoutLimiter.check).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-tenant-slug': 'resto' }) as unknown as Awaited<ReturnType<typeof headers>>,
    );
    vi.mocked(getTenant).mockResolvedValue({ id: 'tenant-1' } as Awaited<
      ReturnType<typeof getTenant>
    >);
    vi.mocked(getTenantBillingIds).mockResolvedValue({
      stripe_customer_id: 'cus_1',
    } as Awaited<ReturnType<typeof getTenantBillingIds>>);
    vi.mocked(stripe.invoices.list).mockResolvedValue({ data: [] } as unknown as Awaited<
      ReturnType<typeof stripe.invoices.list>
    >);
  });

  it('B1: refuse un administrateur prive de settings.view (403, Stripe jamais appele)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseWithMember('admin') as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    vi.mocked(resolveAdminPermission).mockResolvedValue({ allowed: false, role: 'admin' });

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(403);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
    expect(resolveAdminPermission).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'tenant-1',
      'settings.view',
    );
  });

  it('temoin: un administrateur qui a settings.view lit les factures', async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseWithMember('admin') as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    vi.mocked(resolveAdminPermission).mockResolvedValue({ allowed: true, role: 'admin' });

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(200);
    expect(stripe.invoices.list).toHaveBeenCalledTimes(1);
  });

  it('temoin: un serveur reste refuse par le role, meme avec le droit', async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseWithMember('waiter') as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    vi.mocked(resolveAdminPermission).mockResolvedValue({ allowed: true, role: 'waiter' });

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(403);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });
});
