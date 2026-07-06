import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const builder = {
  from: vi.fn(() => builder),
  update: vi.fn(() => builder),
  eq: vi.fn(() => builder),
  lt: vi.fn(() => builder),
  is: vi.fn(() => builder),
  select: mockSelect,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => builder),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('POST /api/cron/freeze-expired-trials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    mockSelect.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
  });

  function createRequest(auth?: string): Request {
    return new Request('http://localhost/api/cron/freeze-expired-trials', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    });
  }

  it('returns 401 without bearer token', async () => {
    const { POST } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await POST(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { POST } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await POST(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(503);
  });

  it('freezes only expired, never-subscribed trials when authorized', async () => {
    const { POST } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await POST(createRequest('Bearer test-cron-secret'));
    const json = (await response.json()) as { success: boolean; frozen: number };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.frozen).toBe(2);
    // Only trials that expired AND never got a Stripe subscription are frozen.
    expect(builder.update).toHaveBeenCalledWith({ subscription_status: 'frozen' });
    expect(builder.eq).toHaveBeenCalledWith('subscription_status', 'trial');
    expect(builder.is).toHaveBeenCalledWith('stripe_subscription_id', null);
  });

  it('returns 500 when the update fails', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const { POST } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await POST(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(500);
  });
});
