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
    mockResolveSessionAdminUser.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      adminUser: {
        tenant_id: 't1',
        role: 'owner',
        tenant_slug: 'resto',
        onboarding_completed: false,
      },
    });
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

  it('reads the state of the tenant resolved from the session, not a re-pick', async () => {
    // The state used to re-pick its tenant on its own: the screen could show B
    // while the saves went to C.
    const { GET } = await import('@/app/api/onboarding/state/route');
    await GET(new Request('http://localhost/api/onboarding/state'));

    expect(mockGetState).toHaveBeenCalledWith('t1');
  });

  it('forwards ?site= to the resolver, restricted to owner memberships', async () => {
    const { GET } = await import('@/app/api/onboarding/state/route');
    await GET(new Request('http://localhost/api/onboarding/state?site=resto-b'));

    expect(mockResolveSessionAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({ siteSlug: 'resto-b', ownerOnly: true }),
    );
  });

  it('rejects a malformed ?site= before any lookup', async () => {
    const { GET } = await import('@/app/api/onboarding/state/route');
    const res = await GET(new Request('http://localhost/api/onboarding/state?site=../x'));

    expect(res.status).toBe(400);
    expect(mockResolveSessionAdminUser).not.toHaveBeenCalled();
  });

  it('refuses a non-owner (the onboarding is the owner job)', async () => {
    mockResolveSessionAdminUser.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      adminUser: {
        tenant_id: 't1',
        role: 'waiter',
        tenant_slug: 'resto',
        onboarding_completed: false,
      },
    });
    const { GET } = await import('@/app/api/onboarding/state/route');
    const res = await GET(new Request('http://localhost/api/onboarding/state'));

    expect(res.status).toBe(403);
    expect(mockGetState).not.toHaveBeenCalled();
  });
});
