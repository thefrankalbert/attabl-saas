import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRateLimitCheck = vi.fn();
const mockGetClientIp = vi.fn(() => '127.0.0.1');
const mockVerifyOrigin = vi.fn(() => null);
const mockCompleteOnboarding = vi.fn();
const mockRevalidateTag = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  onboardingCompleteLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...args) },
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

vi.mock('@/lib/csrf', () => ({
  verifyOrigin: (...args: unknown[]) => mockVerifyOrigin(...args),
}));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock('@/services/onboarding.service', () => ({
  createOnboardingService: vi.fn(() => ({
    completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { tenant_id: 'tenant-1' },
                error: null,
              }),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    });
    mockCompleteOnboarding.mockResolvedValue({ slug: 'tenant-demo' });
  });

  function createRequest(body: unknown): Request {
    return new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import('@/app/api/onboarding/complete/route');
    const response = await POST(createRequest({ data: { restaurantName: 'Demo' } }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(json.error).toBe('Non authentifié');
  });

  it('returns 404 when authenticated user has no tenant', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'not found' },
              }),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    });

    const { POST } = await import('@/app/api/onboarding/complete/route');
    const response = await POST(createRequest({ data: { restaurantName: 'Demo' } }));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe('Tenant non trouvé');
  });

  it('returns success when auth and tenant checks pass', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const response = await POST(
      createRequest({
        data: {
          restaurantName: 'Demo Restaurant',
          venueType: 'restaurant',
          cuisineType: 'africaine',
          currency: 'XOF',
          language: 'fr-FR',
          taxEnabled: true,
          taxRate: 18,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
        },
      }),
    );
    const json = (await response.json()) as { success: boolean; slug: string };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.slug).toBe('tenant-demo');
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        currency: 'XOF',
        language: 'fr-FR',
      }),
    );
  });
});
