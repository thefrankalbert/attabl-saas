import { beforeEach, describe, expect, it, vi } from 'vitest';

// B152: la route du moteur de rappels n'avait aucun test.
const { tick, createReminderService, admin } = vi.hoisted(() => {
  const tick = vi.fn();
  return {
    tick,
    createReminderService: vi.fn(() => ({ tick })),
    admin: { marker: 'service_role' },
  };
});

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => admin) }));
vi.mock('@/services/push.service', () => ({ createPushService: vi.fn(() => ({})) }));
vi.mock('@/services/reminders/reminder.service', () => ({ createReminderService }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function request(auth?: string): Request {
  return new Request('http://localhost/api/cron/reminders', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('GET /api/cron/reminders (B152)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    tick.mockResolvedValue({ tenants: 3, sent: 2, resolved: 1 });
  });

  it('sans le secret: 401, le moteur ne tourne pas', async () => {
    const { GET } = await import('@/app/api/cron/reminders/route');
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer faux'))).status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });

  it('secret non configure: 503, le moteur ne tourne pas', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await import('@/app/api/cron/reminders/route');
    expect((await GET(request('Bearer '))).status).toBe(503);
    expect(tick).not.toHaveBeenCalled();
  });

  it('avec le secret: un passage du moteur (client service_role), bilan rendu', async () => {
    const { GET } = await import('@/app/api/cron/reminders/route');
    const res = await GET(request('Bearer test-cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenants: 3, sent: 2, resolved: 1 });
    expect(createReminderService).toHaveBeenCalledWith(admin, expect.anything());
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][0]).toBeInstanceOf(Date);
  });
});
