import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkoutLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/stripe/server', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
      update: vi.fn(),
    },
  },
  getStripePriceId: vi.fn().mockReturnValue('price_pro_yearly'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../update-subscription/route';
import { checkoutLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockResult<T> {
  data: T | null;
  error: { message: string } | null;
}

type TenantRow = { id: string; stripe_subscription_id: string | null };
type AdminRow = { role: string };

interface MockSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(
  body?: unknown,
  options?: { malformed?: boolean; omitTenantSlug?: boolean },
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options?.omitTenantSlug) {
    headers['x-tenant-slug'] = 'blutable';
  }
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/update-subscription', {
      method: 'POST',
      headers,
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/update-subscription', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function mockRateLimitAllowed(): void {
  vi.mocked(checkoutLimiter.check).mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60_000,
  });
}

function mockRateLimitBlocked(): void {
  vi.mocked(checkoutLimiter.check).mockResolvedValue({
    success: false,
    limit: 5,
    remaining: 0,
    reset: Date.now() + 60_000,
  });
}

/**
 * Builds a chainable mock: select().eq()...().maybeSingle() resolves to result.
 */
function chain<T>(result: MockResult<T>) {
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.maybeSingle = vi.fn(() => Promise.resolve(result));
  return obj;
}

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  authError?: { message: string } | null;
  tenant?: MockResult<TenantRow>;
  adminUser?: MockResult<AdminRow>;
}): MockSupabaseClient {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'owner@restaurant.com' };
  const authError = overrides?.authError ?? null;

  const tenantResult: MockResult<TenantRow> = overrides?.tenant ?? {
    data: { id: 'tenant-abc', stripe_subscription_id: 'sub_test_123' },
    error: null,
  };
  const adminResult: MockResult<AdminRow> = overrides?.adminUser ?? {
    data: { role: 'owner' },
    error: null,
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'tenants') return chain(tenantResult);
      return chain(adminResult);
    }),
  };
}

function setupAuthenticatedMocks(
  supabaseOverrides?: Parameters<typeof createMockSupabase>[0],
): void {
  mockRateLimitAllowed();
  vi.mocked(createClient).mockResolvedValue(createMockSupabase(supabaseOverrides) as never);
}

function mockActiveSubscription(): void {
  vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
    status: 'active',
    items: { data: [{ id: 'si_existing_item' }] },
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/update-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStripePriceId).mockReturnValue('price_pro_yearly');
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimitBlocked();

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimitAllowed();
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabase({ authUser: null, authError: { message: 'No session' } }) as never,
    );

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non authentifi');
  });

  it('returns 400 when x-tenant-slug header is missing', async () => {
    setupAuthenticatedMocks();

    const res = await POST(buildRequest({ plan: 'pro' }, { omitTenantSlug: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Contexte tenant');
  });

  it('returns 404 when tenant is not found', async () => {
    setupAuthenticatedMocks({ tenant: { data: null, error: null } });

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toContain('Tenant non trouv');
  });

  it('returns 403 when user is not a member of the tenant', async () => {
    setupAuthenticatedMocks({ adminUser: { data: null, error: null } });

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toContain('Acces refuse');
  });

  it('returns 403 when user is not owner or admin', async () => {
    setupAuthenticatedMocks({ adminUser: { data: { role: 'manager' }, error: null } });

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toContain('propri');
  });

  it('returns 400 when tenant has no active stripe subscription', async () => {
    setupAuthenticatedMocks({
      tenant: { data: { id: 'tenant-abc', stripe_subscription_id: null }, error: null },
    });

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Aucun abonnement actif');
  });

  it('returns 400 when request body is malformed JSON', async () => {
    setupAuthenticatedMocks();

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Corps de requ');
  });

  it('returns 400 when plan is missing', async () => {
    setupAuthenticatedMocks();

    const res = await POST(buildRequest({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when plan is invalid', async () => {
    setupAuthenticatedMocks();

    const res = await POST(buildRequest({ plan: 'gold' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Plan invalide');
  });

  it('returns 400 when subscription is already canceled', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'canceled',
      items: { data: [] },
    } as never);

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('annul');
  });

  it('returns 500 when subscription has no items', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'active',
      items: { data: [] },
    } as never);

    const res = await POST(buildRequest({ plan: 'pro' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toContain('configuration');
  });

  it('returns 500 when Stripe update throws', async () => {
    setupAuthenticatedMocks();
    mockActiveSubscription();
    vi.mocked(stripe.subscriptions.update).mockRejectedValue(new Error('Stripe network error'));

    const res = await POST(buildRequest({ plan: 'pro', billingInterval: 'yearly' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('Erreur serveur');
  });

  it('returns 200 with subscriptionId and status on success', async () => {
    setupAuthenticatedMocks();
    mockActiveSubscription();
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({
      id: 'sub_test_123',
      status: 'active',
    } as never);

    const res = await POST(buildRequest({ plan: 'pro', billingInterval: 'yearly' }));
    const json = (await res.json()) as { subscriptionId: string; status: string };

    expect(res.status).toBe(200);
    expect(json.subscriptionId).toBe('sub_test_123');
    expect(json.status).toBe('active');
    expect(getStripePriceId).toHaveBeenCalledWith('pro', 'yearly');
  });
});
