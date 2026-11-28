import { describe, it, expect, vi, beforeEach } from 'vitest';

// B1 (revue ligne par ligne, lot B2b-2): la page des factures exige BILLING_READ
// (billing.manage, niveau borne compris), la route ne controlait que le role.
// Modele des postes : le gerant VOIT les factures (billing.manage limite), le
// chef non. La route passe par le VRAI resolveLiveMember sur un client simule.

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

import { GET } from '../invoices/route';
import { checkoutLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';

function supabaseWithMember(
  postes: string[] | null,
  permission_overrides: Record<string, boolean> | null = null,
) {
  const admin = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: postes
        ? { id: 'admin-1', postes, permission_overrides, is_super_admin: false, role: 'staff' }
        : null,
      error: null,
    }),
  };
  const poste = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => (table === 'poste_permissions' ? poste : admin)),
  };
}

function as(postes: string[] | null, overrides: Record<string, boolean> | null = null) {
  vi.mocked(createClient).mockResolvedValue(
    supabaseWithMember(postes, overrides) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
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

  it.each([
    ['chef', ['chef']],
    ['serveur', ['waiter']],
    ['caissier', ['cashier']],
  ])('B1: refuse le poste %s (403, Stripe jamais appele)', async (_label, postes) => {
    as(postes);

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(403);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });

  it('temoin: un gerant (billing.manage limite) lit les factures', async () => {
    as(['manager']);

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(200);
    expect(stripe.invoices.list).toHaveBeenCalledTimes(1);
  });

  it('temoin: le proprietaire lit les factures', async () => {
    as(['owner']);

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(200);
    expect(stripe.invoices.list).toHaveBeenCalledTimes(1);
  });

  it('temoin: un gerant avec permission_overrides billing.manage lit les factures', async () => {
    as(['manager'], { 'billing.manage': true });

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(200);
  });

  it('un gerant a qui le reglage retire billing.manage ne lit plus les factures', async () => {
    as(['manager'], { 'billing.manage': false });

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(403);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });

  it('refuse 404 quand aucune ligne de membre vivante (membre retire)', async () => {
    as(null);

    const res = await GET(new Request('http://localhost/api/invoices'));

    expect(res.status).toBe(404);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });
});
