import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('GET /api/cron/reconcile-payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    mockRpc.mockResolvedValue({ data: 2, error: null });
  });

  function createRequest(auth?: string, maxAgeMinutes?: string): Request {
    const url = new URL('http://localhost/api/cron/reconcile-payments');
    if (maxAgeMinutes) {
      url.searchParams.set('maxAgeMinutes', maxAgeMinutes);
    }
    return new Request(url, {
      method: 'GET',
      headers: auth ? { authorization: auth } : {},
    });
  }

  it('returns 401 without bearer token', async () => {
    const { GET } = await import('@/app/api/cron/reconcile-payments/route');
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await import('@/app/api/cron/reconcile-payments/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(503);
  });

  it('expires stale sessions when authorized', async () => {
    const { GET } = await import('@/app/api/cron/reconcile-payments/route');
    const response = await GET(createRequest('Bearer test-cron-secret', '45'));
    const json = (await response.json()) as {
      success: boolean;
      cleared: number;
      maxAgeMinutes: number;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cleared).toBe(2);
    expect(json.maxAgeMinutes).toBe(45);
    expect(mockRpc).toHaveBeenCalledWith('expire_stale_payment_sessions', {
      p_max_age_minutes: 45,
    });
  });

  it('returns 400 for invalid maxAgeMinutes', async () => {
    const { GET } = await import('@/app/api/cron/reconcile-payments/route');
    const response = await GET(createRequest('Bearer test-cron-secret', '2'));
    expect(response.status).toBe(400);
  });
});
