import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/services/errors';

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.hoisted ensures these are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockCheck,
  mockGetClientIp,
  mockGetUser,
  mockCompleteOAuthSignup,
  mockLoggerError,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockGetUser: vi.fn(),
  mockCompleteOAuthSignup: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  oauthSignupLimiter: { check: mockCheck },
  getClientIp: mockGetClientIp,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

vi.mock('@/services/signup.service', () => ({
  createSignupService: vi.fn(() => ({
    completeOAuthSignup: mockCompleteOAuthSignup,
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: vi.fn(),
  },
}));

// Import the route handler AFTER mocks are set up
import { POST } from '@/app/api/signup-oauth/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '660e8400-e29b-41d4-a716-446655440000';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/signup-oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildMalformedRequest(): Request {
  return new Request('http://localhost/api/signup-oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'NOT-VALID-JSON',
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: VALID_UUID,
    email: 'owner@restaurant.com',
    restaurantName: 'Le Petit Bistro',
    ...overrides,
  };
}

/** Configure mocks for the authenticated happy-path. */
function setupAuthenticated(userId: string = VALID_UUID): void {
  mockCheck.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
  mockGetClientIp.mockReturnValue('127.0.0.1');
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/signup-oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Rate limited -> 429
  it('returns 429 when rate-limited', async () => {
    mockCheck.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 0 });
    mockGetClientIp.mockReturnValue('127.0.0.1');

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/trop de requ/i);
  });

  // 2. Malformed JSON -> 400
  it('returns 400 for malformed JSON body', async () => {
    mockCheck.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
    mockGetClientIp.mockReturnValue('127.0.0.1');

    const res = await POST(buildMalformedRequest());

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalide/i);
  });

  // 3. Zod validation -> 400
  it('returns 400 when Zod validation fails (invalid email)', async () => {
    mockCheck.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
    mockGetClientIp.mockReturnValue('127.0.0.1');

    const res = await POST(buildRequest(validBody({ email: 'not-an-email' })));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBeDefined();
  });

  // 4. Unauthenticated -> 401
  it('returns 401 when user is not authenticated', async () => {
    mockCheck.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
    mockGetClientIp.mockReturnValue('127.0.0.1');
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    });

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/non authentifi/i);
  });

  // 5. IDOR prevention — userId mismatch -> 403
  it('returns 403 when userId does not match authenticated user (IDOR)', async () => {
    setupAuthenticated(OTHER_UUID);

    const res = await POST(buildRequest(validBody({ userId: VALID_UUID })));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/non autoris/i);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('IDOR'),
      expect.objectContaining({
        authenticatedUserId: OTHER_UUID,
        requestedUserId: VALID_UUID,
      }),
    );
  });

  // 6. Successful OAuth signup
  it('returns 200 with slug and tenantId on successful signup', async () => {
    setupAuthenticated();
    mockCompleteOAuthSignup.mockResolvedValue({
      slug: 'le-petit-bistro',
      tenantId: 'tenant-123',
    });

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; slug: string; tenantId: string };
    expect(json).toEqual({
      success: true,
      slug: 'le-petit-bistro',
      tenantId: 'tenant-123',
    });
    expect(mockCompleteOAuthSignup).toHaveBeenCalledWith({
      userId: VALID_UUID,
      email: 'owner@restaurant.com',
      restaurantName: 'Le Petit Bistro',
      phone: undefined,
      plan: undefined,
    });
  });

  // 7. ServiceError mapping
  it('maps ServiceError to the correct HTTP status', async () => {
    setupAuthenticated();
    mockCompleteOAuthSignup.mockRejectedValue(new ServiceError('Slug already taken', 'CONFLICT'));

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Slug already taken');
  });

  // 8. Unknown error -> 500
  it('returns 500 for unexpected errors', async () => {
    setupAuthenticated();
    mockCompleteOAuthSignup.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/erreur serveur/i);
    expect(mockLoggerError).toHaveBeenCalledWith('OAuth Signup error', expect.any(Error));
  });

  // 9. Missing restaurantName -> 400
  it('returns 400 when restaurantName is missing', async () => {
    mockCheck.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
    mockGetClientIp.mockReturnValue('127.0.0.1');

    const body = { userId: VALID_UUID, email: 'a@b.com' };
    const res = await POST(buildRequest(body));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBeDefined();
  });

  // 10. Valid phone optional
  it('accepts a request with optional phone field', async () => {
    setupAuthenticated();
    mockCompleteOAuthSignup.mockResolvedValue({
      slug: 'le-petit-bistro',
      tenantId: 'tenant-456',
    });

    const res = await POST(buildRequest(validBody({ phone: '+33612345678' })));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; slug: string; tenantId: string };
    expect(json.success).toBe(true);
    expect(mockCompleteOAuthSignup).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+33612345678' }),
    );
  });
});
