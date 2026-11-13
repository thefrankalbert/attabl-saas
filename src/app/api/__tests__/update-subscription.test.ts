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
    invoices: {
      voidInvoice: vi.fn().mockResolvedValue({}),
      retrieve: vi.fn().mockResolvedValue({ status: 'open' }),
    },
  },
  getStripePriceId: vi.fn().mockReturnValue('price_pro_yearly'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/billing/tenant-billing-ids', () => ({
  getTenantBillingIds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../update-subscription/route';
import { checkoutLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';

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

  // The Stripe id is no longer read by the session client (column revoked for
  // `authenticated`): it comes from the service-role helper. Same fixture.
  vi.mocked(getTenantBillingIds).mockResolvedValue({
    stripe_customer_id: null,
    stripe_subscription_id: tenantResult.data?.stripe_subscription_id ?? null,
  });

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
    expect(getTenantBillingIds).not.toHaveBeenCalled();
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

  it('refuse le changement de formule a un abonnement en impaye (intrusion M-03)', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'past_due',
      items: { data: [{ id: 'si_1' }] },
    } as never);

    const res = await POST(buildRequest({ plan: 'business' }));

    expect(res.status).toBe(400);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('facture la difference tout de suite et refuse si le paiement echoue (intrusion M-03)', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_1' }] },
    } as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      pending_update: { expires_at: 1 },
      latest_invoice: 'in_refusee',
    } as never);

    const res = await POST(buildRequest({ plan: 'business' }));
    const json = (await res.json()) as { code?: string };

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      }),
    );
    expect(res.status).toBe(402);
    expect(json.code).toBe('PAYMENT_REQUIRED');
    // La facture refusee est annulee: elle ne doit ni etre relancee, ni etre
    // payee plus tard sans que la formule soit appliquee.
    expect(stripe.invoices.voidInvoice).toHaveBeenCalledWith('in_refusee');
  });

  it("dit de contacter le support quand la facture refusee n'a pas pu etre annulee", async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_1' }] },
    } as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      pending_update: { expires_at: 1 },
      latest_invoice: 'in_refusee',
    } as never);
    // Une seule fois par appel: une doublure qui rejetterait pour toujours
    // polluerait les tests suivants (le disjoncteur Stripe garde son etat).
    vi.mocked(stripe.invoices.voidInvoice)
      .mockRejectedValueOnce(new Error('Stripe en panne'))
      .mockRejectedValueOnce(new Error('Stripe en panne'));
    vi.mocked(stripe.invoices.retrieve).mockResolvedValueOnce({ status: 'open' } as never);

    const res = await POST(buildRequest({ plan: 'business' }));
    const json = (await res.json()) as { error: string };

    // Deux essais, puis un message qui ne promet pas que rien ne sera preleve.
    expect(stripe.invoices.voidInvoice).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(402);
    expect(json.error).toContain('support');
  });

  it('repond 200 quand la facture a ete payee entre-temps: le changement est applique', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_1' }] },
    } as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      pending_update: { expires_at: 1 },
      latest_invoice: 'in_payee',
    } as never);
    vi.mocked(stripe.invoices.voidInvoice)
      .mockRejectedValueOnce(new Error('facture deja payee'))
      .mockRejectedValueOnce(new Error('facture deja payee'));
    vi.mocked(stripe.invoices.retrieve).mockResolvedValueOnce({ status: 'paid' } as never);

    const res = await POST(buildRequest({ plan: 'business' }));

    expect(stripe.invoices.retrieve).toHaveBeenCalledWith('in_payee');
    expect(res.status).toBe(200);
  });

  it('garde le message normal quand la facture etait deja annulee', async () => {
    setupAuthenticatedMocks();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      status: 'active',
      items: { data: [{ id: 'si_1' }] },
    } as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      pending_update: { expires_at: 1 },
      latest_invoice: 'in_annulee',
    } as never);
    vi.mocked(stripe.invoices.voidInvoice)
      .mockRejectedValueOnce(new Error('deja annulee'))
      .mockRejectedValueOnce(new Error('deja annulee'));
    vi.mocked(stripe.invoices.retrieve).mockResolvedValueOnce({ status: 'void' } as never);

    const res = await POST(buildRequest({ plan: 'business' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(402);
    expect(json.error).not.toContain('support');
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
    // Read via the service role, for the verified tenant only.
    expect(getTenantBillingIds).toHaveBeenCalledWith('tenant-abc');
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_test_123');
  });
});
