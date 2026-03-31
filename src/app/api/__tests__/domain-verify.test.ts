import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  domainVerifyLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../domain-verify/route';
import { domainVerifyLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

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

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  authError?: { message: string } | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'admin@test.com' };
  const authError = overrides?.authError ?? null;

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: vi.fn(),
  };
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
    const mock = createMockSupabase({ authUser: null, authError: { message: 'No session' } });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest({ domain: 'test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autorise');
  });

  it('returns 400 when body is malformed JSON', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when domain is missing', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns verified: true when CNAME points to Vercel', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
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
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildRequest({ domain: 'other.example.com' }));
    const json = (await res.json()) as { verified: boolean; domain: string };

    expect(res.status).toBe(200);
    expect(json.verified).toBe(false);
  });
});
