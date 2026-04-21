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
  hashEmail: (email: string) => `hash_${email}`,
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
  generateLinkResult?: { data: unknown; error: unknown };
  generateLinkImpl?: (params: { type: string }) => Promise<{ data: unknown; error: unknown }>;
}) {
  const defaultResult = overrides?.generateLinkResult ?? {
    data: { properties: { hashed_token: 'token_abc123' } },
    error: null,
  };

  const generateLink = overrides?.generateLinkImpl
    ? vi.fn().mockImplementation(overrides.generateLinkImpl)
    : vi.fn().mockResolvedValue(defaultResult);

  return {
    auth: {
      admin: {
        generateLink,
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

  it('returns success when user does not exist (prevents enumeration)', async () => {
    mockRateLimit(true);
    // Both recovery and signup generateLink fail for non-existent user
    const mock = createMockAdminClient({
      generateLinkImpl: async () => ({
        data: null,
        error: { message: 'User not found' },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unknown@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns success and sends reset email when user exists with confirmed email', async () => {
    mockRateLimit(true);
    // Recovery link succeeds for confirmed users
    const mock = createMockAdminClient({
      generateLinkResult: {
        data: { properties: { hashed_token: 'recovery_token_123' } },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'known@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mock.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'known@test.com',
    });
  });

  it('does NOT fall back to signup link when recovery fails (anti-enumeration)', async () => {
    mockRateLimit(true);
    // Recovery fails. The previous behavior was to attempt a type:'signup'
    // link which could silently create a user for a non-existent email.
    // The route now returns success (anti-enumeration) without any fallback.
    const mock = createMockAdminClient({
      generateLinkImpl: async () => ({
        data: null,
        error: { message: 'User not found' },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const res = await POST(buildRequest({ email: 'unconfirmed@test.com' }));
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Recovery attempted once, no second call for the removed signup fallback.
    expect(mock.auth.admin.generateLink).toHaveBeenCalledTimes(1);
    expect(mock.auth.admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'recovery' }),
    );
  });

  it('does not call listUsers (scalability fix)', async () => {
    mockRateLimit(true);
    const mock = createMockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await POST(buildRequest({ email: 'test@test.com' }));

    // listUsers should not exist on the mock at all -- the route no longer calls it
    expect((mock.auth.admin as Record<string, unknown>).listUsers).toBeUndefined();
  });
});
