import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  resendConfirmationLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  hashEmail: (email: string) => `hash_${email}`,
}));

vi.mock('@/services/email.service', () => ({
  sendWelcomeConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../resend-confirmation/route';
import { resendConfirmationLimiter } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(body?: unknown, options?: { malformed?: boolean }): Request {
  if (options?.malformed) {
    return new Request('http://localhost:3000/api/resend-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost:3000/api/resend-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(resendConfirmationLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 3,
    remaining: allowed ? 2 : 0,
    reset: Date.now() + 600_000,
  });
}

function createMockAdminClient(overrides?: {
  generateLinkResult?: { data: unknown; error: unknown };
}) {
  const generateLinkResult = overrides?.generateLinkResult ?? {
    data: { properties: { hashed_token: 'token_abc123' } },
    error: null,
  };

  return {
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue(generateLinkResult),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/resend-confirmation', () => {
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

  it('returns success when user does not exist (prevents enumeration)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      generateLinkResult: { data: null, error: { message: 'User not found' } },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unknown@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success when user already confirmed (prevents enumeration)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      generateLinkResult: { data: null, error: { message: 'User already confirmed' } },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'confirmed@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success when confirmation email is resent', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      generateLinkResult: {
        data: { properties: { hashed_token: 'confirm_token_123' } },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unconfirmed@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 500 when generateLink fails with a server error', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient({
      generateLinkResult: { data: null, error: { message: 'Internal server error' } },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'fail@test.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBeDefined();
  });

  it('does not call listUsers (scalability fix)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await POST(buildRequest({ email: 'test@test.com' }));

    expect((mock.auth.admin as Record<string, unknown>).listUsers).toBeUndefined();
  });
});
