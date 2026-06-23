import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRateLimitCheck = vi.fn();
const mockGetClientIp = vi.fn(() => '127.0.0.1');
const mockGetState = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  onboardingStateLimiter: { check: mockRateLimitCheck },
  getClientIp: mockGetClientIp,
}));

vi.mock('@/services/onboarding.service', () => ({
  createOnboardingService: vi.fn(() => ({
    getState: mockGetState,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

const mockResolveSessionAdminUser = vi.fn();

vi.mock('@/lib/auth/session-admin-user', () => ({
  resolveSessionAdminUser: (...args: unknown[]) => mockResolveSessionAdminUser(...args),
}));

describe('GET /api/onboarding/state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockResolveSessionAdminUser.mockResolvedValue({ ok: true });
    mockGetState.mockResolvedValue({ step: 0, completed: false });
  });

  it('returns the onboarding state with a no-store cache policy', async () => {
    // Anti-regression: the URL does not vary per user, so a cacheable response would
    // leak the previous user state on a shared browser. The header MUST be no-store.
    const { GET } = await import('@/app/api/onboarding/state/route');
    const res = await GET(new Request('http://localhost/api/onboarding/state'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    await expect(res.json()).resolves.toEqual({ step: 0, completed: false });
  });
});
