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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../billing-portal/route';
import { billingPortalLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

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

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  authError?: { message: string } | null;
  adminUser?: { data: unknown; error: unknown };
}) {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'owner@test.com' };
  const authError = overrides?.authError ?? null;

  const adminUserResult = overrides?.adminUser ?? {
    data: {
      tenant_id: 'tenant-1',
      tenants: { stripe_customer_id: 'cus_test_123', slug: 'my-restaurant' },
    },
    error: null,
  };

  const mockSingle = vi.fn().mockResolvedValue(adminUserResult);
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: vi.fn().mockReturnValue({ select: mockSelect }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/billing-portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('returns 400 when tenant has no stripe_customer_id', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({
      adminUser: {
        data: { tenant_id: 'tenant-1', tenants: { stripe_customer_id: null, slug: 'test' } },
        error: null,
      },
    });
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
