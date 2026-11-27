import { beforeEach, describe, expect, it, vi } from 'vitest';

// B104: la relance d'inactivite part de cette tache planifiee.
const { sendTrialIdleEmails, admin } = vi.hoisted(() => ({
  sendTrialIdleEmails: vi.fn(),
  admin: { marker: 'service_role' },
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => admin) }));
vi.mock('@/services/trigger-emails.service', () => ({ sendTrialIdleEmails }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function request(auth?: string): Request {
  return new Request('http://localhost/api/cron/trial-idle-emails', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('GET /api/cron/trial-idle-emails (B104)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    sendTrialIdleEmails.mockResolvedValue({ candidates: 1, sent: 1 });
  });

  it('sans le secret: 401, aucun envoi', async () => {
    const { GET } = await import('@/app/api/cron/trial-idle-emails/route');
    expect((await GET(request())).status).toBe(401);
    expect(sendTrialIdleEmails).not.toHaveBeenCalled();
  });

  it('secret non configure: 503, aucun envoi', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await import('@/app/api/cron/trial-idle-emails/route');
    expect((await GET(request('Bearer '))).status).toBe(503);
    expect(sendTrialIdleEmails).not.toHaveBeenCalled();
  });

  it('avec le secret: relances envoyees, bilan rendu', async () => {
    const { GET } = await import('@/app/api/cron/trial-idle-emails/route');
    const res = await GET(request('Bearer test-cron-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: 1, sent: 1 });
    expect(sendTrialIdleEmails).toHaveBeenCalledWith(admin, expect.any(Date));
  });

  it('panne de lecture: 500 avec un texte fixe', async () => {
    sendTrialIdleEmails.mockRejectedValue({ message: 'relation "tenants" timeout' });
    const { GET } = await import('@/app/api/cron/trial-idle-emails/route');
    const res = await GET(request('Bearer test-cron-secret'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Erreur serveur' });
  });
});
