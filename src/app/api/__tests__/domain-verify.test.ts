import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  domainVerifyLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// DOMAIN-VERIFY: la route ne fait plus un simple getUser(), elle exige
// `settings.edit` via getAuthenticatedUserWithTenant. Le mock suit.
const { MockAuthError } = vi.hoisted(() => ({
  MockAuthError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: vi.fn(),
  AuthError: MockAuthError,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../domain-verify/route';
import { domainVerifyLimiter } from '@/lib/rate-limit';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/domain-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/domain-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(domainVerifyLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 5,
    remaining: allowed ? 4 : 0,
    reset: Date.now() + 600_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/domain-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch for DNS lookup
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ Answer: [] }),
      }),
    );
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildRequest({ domain: 'test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockRejectedValue(
      new AuthError('Non authentifie', 401),
    );

    const res = await POST(buildRequest({ domain: 'test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non authentifie');
  });

  it('returns 403 when the member lacks settings.edit', async () => {
    // DOMAIN-VERIFY. Le point du correctif: une session valide ne suffit plus.
    // Avant, un serveur de n'importe quel etablissement pouvait declencher une
    // verification de domaine.
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockRejectedValue(
      new AuthError('Permissions insuffisantes', 403),
    );

    const res = await POST(buildRequest({ domain: 'test.com' }));

    expect(res.status).toBe(403);
  });

  it('returns 400 when body is malformed JSON', async () => {
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockResolvedValue({} as never);

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when domain is missing', async () => {
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockResolvedValue({} as never);

    const res = await POST(buildRequest({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns verified: true when CNAME points to Vercel', async () => {
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockResolvedValue({} as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          Answer: [{ data: 'cname.vercel-dns.com.' }],
        }),
      }),
    );

    const res = await POST(buildRequest({ domain: 'menu.restaurant.com' }));
    const json = (await res.json()) as { verified: boolean; domain: string };

    expect(res.status).toBe(200);
    expect(json.verified).toBe(true);
    expect(json.domain).toBe('menu.restaurant.com');
  });

  it('returns verified: false when CNAME does not point to Vercel', async () => {
    mockRateLimit(true);
    vi.mocked(getAuthenticatedUserWithTenant).mockResolvedValue({} as never);

    const res = await POST(buildRequest({ domain: 'other.example.com' }));
    const json = (await res.json()) as { verified: boolean; domain: string };

    expect(res.status).toBe(200);
    expect(json.verified).toBe(false);
  });
});
