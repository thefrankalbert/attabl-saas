import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkoutLimiter: {
    check: vi.fn(),
  },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/stripe/server', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
  getStripePriceId: vi.fn().mockReturnValue('price_test_123'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../create-checkout-session/route';
import { checkoutLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types for mocked objects
// ---------------------------------------------------------------------------

interface MockSingleResult {
  data: { tenant_id: string; tenants: { name: string } } | null;
  error: { message: string } | null;
}

interface MockSupabaseAuth {
  getUser: ReturnType<typeof vi.fn>;
}

interface MockSupabaseClient {
  auth: MockSupabaseAuth;
  from: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }

  return new Request('http://localhost:3000/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimitAllowed(): void {
  vi.mocked(checkoutLimiter.check).mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 600_000,
  });
}

function mockRateLimitBlocked(): void {
  vi.mocked(checkoutLimiter.check).mockResolvedValue({
    success: false,
    limit: 5,
    remaining: 0,
    reset: Date.now() + 600_000,
  });
}

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  authError?: { message: string } | null;
  adminUser?: MockSingleResult;
}): MockSupabaseClient {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'owner@restaurant.com' };
  const authError = overrides?.authError ?? null;

  const singleResult: MockSingleResult = overrides?.adminUser ?? {
    data: { tenant_id: 'tenant-abc', tenants: { name: 'Mon Restaurant' } },
    error: null,
  };

  const mockSingle = vi.fn().mockResolvedValue(singleResult);

  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });

  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: mockSelect,
    }),
  };
}

function setupAuthenticatedMocks(
  supabaseOverrides?: Parameters<typeof createMockSupabase>[0],
): void {
  mockRateLimitAllowed();
  const mockSupabase = createMockSupabase(supabaseOverrides);
  vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/create-checkout-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Rate limited -> 429
  it('returns 429 when rate limited', async () => {
    mockRateLimitBlocked();

    const response = await POST(buildRequest({ plan: 'essentiel' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  // 2. Unauthenticated -> 401
  it('returns 401 when user is not authenticated', async () => {
    mockRateLimitAllowed();
    const mockSupabase = createMockSupabase({
      authUser: null,
      authError: { message: 'Invalid token' },
    });
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);

    const response = await POST(buildRequest({ plan: 'essentiel' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(json.error).toContain('Non authentifi');
  });

  // 3. No tenant -> 404
  it('returns 404 when user has no associated tenant', async () => {
    setupAuthenticatedMocks({
      adminUser: { data: null, error: { message: 'No rows found' } },
    });

    const response = await POST(buildRequest({ plan: 'essentiel' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toContain('Tenant non trouv');
  });

  // 4. Invalid body -> 400
  it('returns 400 when body has invalid fields', async () => {
    setupAuthenticatedMocks();

    const response = await POST(buildRequest({ plan: 'essentiel', billingInterval: 'weekly' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  // 5. Invalid plan -> 400
  it('returns 400 when plan is not essentiel or premium', async () => {
    setupAuthenticatedMocks();

    const response = await POST(buildRequest({ plan: 'enterprise' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toContain('Plan invalide');
  });

  // 6. Successful session creation -> returns sessionId + url
  it('returns sessionId and url on successful checkout session creation', async () => {
    setupAuthenticatedMocks();

    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_test_session_123',
      url: 'https://checkout.stripe.com/pay/cs_test_session_123',
    } as never);

    const response = await POST(buildRequest({ plan: 'premium', billingInterval: 'yearly' }));
    const json = (await response.json()) as { sessionId: string; url: string };

    expect(response.status).toBe(200);
    expect(json.sessionId).toBe('cs_test_session_123');
    expect(json.url).toBe('https://checkout.stripe.com/pay/cs_test_session_123');
  });

  // 7. Stripe error -> 500
  it('returns 500 when Stripe throws an error', async () => {
    setupAuthenticatedMocks();

    vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(
      new Error('Stripe connection failed'),
    );

    const response = await POST(buildRequest({ plan: 'essentiel' }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(json.error).toBe('Stripe connection failed');
    expect(logger.error).toHaveBeenCalledWith(
      'Stripe checkout error',
      expect.objectContaining({ message: 'Stripe connection failed' }),
    );
  });

  // 8. Malformed JSON -> 400
  it('returns 400 when request body is malformed JSON', async () => {
    setupAuthenticatedMocks();

    const response = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toContain('Corps de requ');
  });
});
