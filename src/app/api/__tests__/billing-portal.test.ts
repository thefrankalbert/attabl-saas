import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  billingPortalLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/stripe/server', () => ({
  stripe: {
    billingPortal: {
      sessions: { create: vi.fn() },
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  getTenant: vi.fn(),
}));

vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../billing-portal/route';
import { billingPortalLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(): Request {
  return new Request('http://localhost:3000/api/billing-portal', {
    method: 'POST',
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(billingPortalLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 10,
    remaining: allowed ? 9 : 0,
    reset: Date.now() + 60_000,
  });
}

interface MockMember {
  postes: string[];
  permission_overrides?: Record<string, boolean> | null;
}

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  authError?: { message: string } | null;
  /** `null` = aucune ligne de membre vivante. */
  member?: MockMember | null;
  stripeCustomerId?: string | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'owner@test.com' };
  const authError = overrides?.authError ?? null;
  const member: MockMember | null =
    overrides?.member === undefined ? { postes: ['owner'] } : overrides.member;
  const stripeCustomerId =
    overrides?.stripeCustomerId === undefined ? 'cus_test_123' : overrides.stripeCustomerId;

  // resolveLiveMember: .select().eq('user_id').eq('tenant_id').eq('is_active').is('deleted_at').maybeSingle()
  const adminUsersChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: member
        ? {
            id: 'admin-row-1',
            postes: member.postes,
            permission_overrides: member.permission_overrides ?? null,
            is_super_admin: false,
            role: 'staff',
          }
        : null,
      error: null,
    }),
  };
  // loadPosteOverrides: .select().eq('tenant_id').in('poste', [...]) -> aucun reglage du restaurant
  const posteChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  // The Stripe id comes from the service-role helper, never from the session client.
  vi.mocked(getTenantBillingIds).mockResolvedValue({
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: null,
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: vi.fn((table: string) => (table === 'poste_permissions' ? posteChain : adminUsersChain)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/billing-portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === 'x-tenant-slug' ? 'my-restaurant' : null),
    } as never);
    vi.mocked(getTenant).mockResolvedValue({ id: 'tenant-1', slug: 'my-restaurant' } as never);
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null, authError: { message: 'Invalid token' } });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autoris');
  });

  it.each([
    ['chef', { postes: ['chef'] }],
    ['cashier', { postes: ['cashier'] }],
    // Le gerant VOIT les factures (billing.manage limite) mais ne gere pas la facturation.
    ['manager sans reglage billing.manage', { postes: ['manager'] }],
    [
      'manager avec billing.manage retire',
      { postes: ['manager'], permission_overrides: { 'billing.manage': false } },
    ],
  ])('returns 403 for %s, Stripe jamais appele', async (_label, member) => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ member }) as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toContain('Non autoris');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(getTenantBillingIds).not.toHaveBeenCalled();
  });

  it('temoin: un gerant avec permission_overrides billing.manage ouvre le portail', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabase({
        member: { postes: ['manager'], permission_overrides: { 'billing.manage': true } },
      }) as never,
    );
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    } as never);

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when no admin_users row matches the user and tenant', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ member: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toContain('Non autoris');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('returns 400 when tenant has no stripe_customer_id', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ stripeCustomerId: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Stripe');
  });

  it('returns url on successful billing portal session creation', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({
      url: 'https://billing.stripe.com/session/test',
    } as never);

    const res = await POST(buildRequest());
    const json = (await res.json()) as { url: string };

    expect(res.status).toBe(200);
    expect(json.url).toBe('https://billing.stripe.com/session/test');
    // Stripe id read via the service role, for the verified tenant only.
    expect(getTenantBillingIds).toHaveBeenCalledWith('tenant-1');
    expect(mock.from).toHaveBeenCalledWith('admin_users');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_test_123' }),
    );
  });

  it('returns 500 when Stripe throws', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(stripe.billingPortal.sessions.create).mockRejectedValue(new Error('Stripe down'));

    const res = await POST(buildRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toContain('Erreur interne');
  });
});
