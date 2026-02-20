import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const mockCheck =
  vi.fn<() => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>>();

vi.mock('@/lib/rate-limit', () => ({
  verifyCheckoutLimiter: { check: () => mockCheck() },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Supabase mock — built per-test via `configureMockSupabase`
const mockGetUser =
  vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: Error | null }>>();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// Stripe mock — the route uses `new Stripe(...)` so we need a class constructor
// Use vi.hoisted() so the mock fn is available when the vi.mock factory runs (hoisted)
const { mockSessionRetrieve } = vi.hoisted(() => ({
  mockSessionRetrieve: vi.fn(),
}));

vi.mock('stripe', () => {
  return {
    default: class StripeMock {
      checkout = {
        sessions: {
          retrieve: mockSessionRetrieve,
        },
      };
    },
  };
});

// ---------------------------------------------------------------------------
// Import the handler AFTER mocks are set up
// ---------------------------------------------------------------------------
import { GET } from '../verify-checkout/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Request with an optional session_id query param */
function makeRequest(sessionId?: string): Request {
  const url = sessionId
    ? `http://localhost/api/verify-checkout?session_id=${sessionId}`
    : 'http://localhost/api/verify-checkout';
  return new Request(url, { method: 'GET' });
}

/** Parse the JSON body from a Response */
async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Configure the mock Supabase `from` to respond to chained queries.
 *
 * Usage:
 *   configureMockSupabase({
 *     admin_users: { data: { tenant_id: 'tid' }, error: null },
 *     tenants: { data: { slug: 'my-slug' }, error: null },
 *   });
 */
function configureMockSupabase(
  tableResponses: Record<string, { data: unknown; error: unknown }>,
): void {
  mockFrom.mockImplementation((table: string) => {
    const response = tableResponses[table] ?? { data: null, error: { message: 'no mock' } };
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(response),
          }),
          single: vi.fn().mockResolvedValue(response),
        }),
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/verify-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limiter allows
    mockCheck.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  // 1. Rate limited
  it('should return 429 when rate limited', async () => {
    mockCheck.mockResolvedValue({ success: false, limit: 10, remaining: 0, reset: 0 });

    const response = await GET(makeRequest('cs_test_abc'));
    const body = await jsonBody(response);

    expect(response.status).toBe(429);
    expect(body.error).toBeDefined();
  });

  // 2. Missing session_id
  it('should return 400 when session_id is missing', async () => {
    const response = await GET(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // 3. Unauthenticated
  it('should return 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('No session'),
    });

    const response = await GET(makeRequest('cs_test_abc'));
    const body = await jsonBody(response);

    expect(response.status).toBe(401);
    expect(body.error).toBeDefined();
  });

  // 4. Session not found
  it('should return 404 when Stripe session is not found', async () => {
    mockSessionRetrieve.mockResolvedValue(null);

    const response = await GET(makeRequest('cs_test_nonexistent'));
    const body = await jsonBody(response);

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
  });

  // 5. User doesn't own tenant
  it('should return 403 when user does not own the tenant', async () => {
    mockSessionRetrieve.mockResolvedValue({
      metadata: { tenant_id: 'tenant-abc' },
      payment_status: 'paid',
    });

    configureMockSupabase({
      admin_users: { data: null, error: { message: 'not found' } },
    });

    const response = await GET(makeRequest('cs_test_stolen'));
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(body.error).toBeDefined();
  });

  // 6. Missing tenant_id in session metadata
  it('should return 400 when Stripe session has no tenant_id in metadata', async () => {
    mockSessionRetrieve.mockResolvedValue({
      metadata: {},
      payment_status: 'paid',
    });

    const response = await GET(makeRequest('cs_test_no_tenant'));
    const body = await jsonBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // 7. Tenant not found in database
  it('should return 404 when tenant is not found in the database', async () => {
    mockSessionRetrieve.mockResolvedValue({
      metadata: { tenant_id: 'tenant-xyz' },
      payment_status: 'paid',
    });

    configureMockSupabase({
      admin_users: { data: { tenant_id: 'tenant-xyz' }, error: null },
      tenants: { data: null, error: { message: 'not found' } },
    });

    const response = await GET(makeRequest('cs_test_no_tenant_db'));
    const body = await jsonBody(response);

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
  });

  // 8. Successful verification
  it('should return slug and payment status on success', async () => {
    mockSessionRetrieve.mockResolvedValue({
      metadata: { tenant_id: 'tenant-abc' },
      payment_status: 'paid',
    });

    configureMockSupabase({
      admin_users: { data: { tenant_id: 'tenant-abc' }, error: null },
      tenants: { data: { slug: 'mon-restaurant' }, error: null },
    });

    const response = await GET(makeRequest('cs_test_success'));
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      slug: 'mon-restaurant',
      status: 'paid',
    });
  });
});
