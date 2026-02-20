import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/services/errors';

// ---------------------------------------------------------------------------
// Mocks — all external dependencies are mocked before the route is imported.
// ---------------------------------------------------------------------------

const mockCheck = vi.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
const mockGetClientIp = vi.fn<(req: Request) => string>().mockReturnValue('127.0.0.1');

vi.mock('@/lib/rate-limit', () => ({
  signupLimiter: { check: (...args: unknown[]) => mockCheck(...(args as [])) },
  getClientIp: (req: Request) => mockGetClientIp(req),
}));

const mockCreateAdminClient = vi.fn().mockReturnValue({});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

const mockCompleteEmailSignup = vi.fn<() => Promise<{ slug: string; tenantId: string }>>();

vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({
    completeEmailSignup: (...args: unknown[]): Promise<{ slug: string; tenantId: string }> =>
      mockCompleteEmailSignup(...(args as [])),
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import the route handler AFTER mocks are in place
import { POST } from '@/app/api/signup/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validBody() {
  return {
    restaurantName: 'Le Petit Bistrot',
    email: 'owner@bistrot.com',
    password: 'securePass123',
  };
}

function makeRequest(body?: unknown, options?: { throwOnJson?: boolean }): Request {
  if (options?.throwOnJson) {
    return {
      headers: new Headers(),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Request;
  }
  return new Request('http://localhost/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue({ success: true });
  });

  // 1. Rate limited -> 429
  it('returns 429 when rate limited', async () => {
    mockCheck.mockResolvedValueOnce({ success: false });

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/trop de requ/i);
  });

  // 2. Malformed JSON -> 400
  it('returns 400 for malformed JSON body', async () => {
    const res = await POST(makeRequest(undefined, { throwOnJson: true }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalide/i);
  });

  // 3. Zod validation failure -> 400
  it('returns 400 when Zod validation fails (missing required fields)', async () => {
    const res = await POST(makeRequest({ restaurantName: 'Ok' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBeDefined();
  });

  // 4. ServiceError maps to correct HTTP status
  it('maps ServiceError CONFLICT to 409', async () => {
    mockCompleteEmailSignup.mockRejectedValueOnce(
      new ServiceError('Email already registered', 'CONFLICT'),
    );

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Email already registered');
  });

  // 5. Successful signup -> returns slug + tenantId
  it('returns 200 with slug and tenantId on successful signup', async () => {
    mockCompleteEmailSignup.mockResolvedValueOnce({
      slug: 'le-petit-bistrot',
      tenantId: 'tenant-uuid-123',
    });

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      slug: string;
      tenantId: string;
      message: string;
    };
    expect(json.success).toBe(true);
    expect(json.slug).toBe('le-petit-bistrot');
    expect(json.tenantId).toBe('tenant-uuid-123');
    expect(json.message).toBeDefined();
  });

  // 6. Unknown error -> 500
  it('returns 500 for unexpected errors', async () => {
    mockCompleteEmailSignup.mockRejectedValueOnce(new Error('Database connection lost'));

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/erreur serveur/i);
  });

  // 7. Short password rejected
  it('returns 400 when password is too short', async () => {
    const body = { ...validBody(), password: 'abc' };

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/mot de passe/i);
  });

  // 8. Invalid email rejected
  it('returns 400 when email format is invalid', async () => {
    const body = { ...validBody(), email: 'not-an-email' };

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/email/i);
  });
});
