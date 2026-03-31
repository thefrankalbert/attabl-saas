import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  forgotPasswordLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/email.service', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../forgot-password/route';
import { forgotPasswordLimiter } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(forgotPasswordLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 3,
    remaining: allowed ? 2 : 0,
    reset: Date.now() + 600_000,
  });
}

function createMockAdminClient(overrides?: {
  users?: Array<{ id: string; email: string; email_confirmed_at: string | null }>;
  generateLinkResult?: { data: unknown; error: unknown };
}) {
  const users = overrides?.users ?? [];
  const generateLinkResult = overrides?.generateLinkResult ?? {
    data: { properties: { hashed_token: 'token_abc123' } },
    error: null,
  };

  return {
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({ data: { users } }),
        generateLink: vi.fn().mockResolvedValue(generateLinkResult),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildRequest({ email: 'test@test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 400 when body is malformed JSON', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest(undefined, { malformed: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email is invalid', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'not-an-email' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Email invalide');
  });

  it('returns success even when user does not exist (prevents enumeration)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({ users: [] });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unknown@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success when user exists and email is confirmed', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      users: [{ id: 'u1', email: 'known@test.com', email_confirmed_at: '2026-01-01T00:00:00Z' }],
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'known@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success when user exists but email is NOT confirmed', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      users: [{ id: 'u1', email: 'unconfirmed@test.com', email_confirmed_at: null }],
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unconfirmed@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
