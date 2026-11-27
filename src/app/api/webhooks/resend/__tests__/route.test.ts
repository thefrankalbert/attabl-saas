import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { appliquerEvenement, check } = vi.hoisted(() => ({
  appliquerEvenement: vi.fn(),
  check: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  kitchenItemLimiter: { check },
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/services/email-suppression.service', () => ({
  createEmailSuppressionService: () => ({ appliquerEvenement }),
}));

import { logger } from '@/lib/logger';
import { POST } from '../route';

const CLE = Buffer.from('cle-de-test-du-webhook-resend-32o');
const SECRET = `whsec_${CLE.toString('base64')}`;
const CORPS = JSON.stringify({
  type: 'email.bounced',
  data: { to: ['morte@exemple.com'], bounce: { type: 'Permanent' } },
});

function requete(corps: string, opts: { ts?: number; cle?: Buffer } = {}): Request {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', opts.cle ?? CLE)
    .update(`msg_1.${ts}.${corps}`)
    .digest('base64');
  return new Request('https://attabl.com/api/webhooks/resend', {
    method: 'POST',
    headers: { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
    body: corps,
  });
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    check.mockResolvedValue({ success: true, limit: 0, remaining: 0, reset: 0 });
    appliquerEvenement.mockResolvedValue(1);
    vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('signature valide: le rebond est applique (adresse bloquee)', async () => {
    const res = await POST(requete(CORPS));
    expect(res.status).toBe(200);
    expect(appliquerEvenement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email.bounced' }),
      'msg_1',
    );
  });

  it('signature invalide: 401, rien applique', async () => {
    const res = await POST(requete(CORPS, { cle: Buffer.from('autre-cle') }));
    expect(res.status).toBe(401);
    expect(appliquerEvenement).not.toHaveBeenCalled();
  });

  it('horodatage perime (6 minutes): 401, rien applique', async () => {
    const res = await POST(requete(CORPS, { ts: Math.floor(Date.now() / 1000) - 360 }));
    expect(res.status).toBe(401);
    expect(appliquerEvenement).not.toHaveBeenCalled();
  });

  it('secret absent: 503 et journal d erreur, jamais d acceptation', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    const res = await POST(requete(CORPS));
    expect(res.status).toBe(503);
    expect(logger.error).toHaveBeenCalled();
    expect(appliquerEvenement).not.toHaveBeenCalled();
  });

  it('limiteur depasse: 429 avant toute lecture', async () => {
    check.mockResolvedValue({ success: false, limit: 0, remaining: 0, reset: 0 });
    const res = await POST(requete(CORPS));
    expect(res.status).toBe(429);
    expect(appliquerEvenement).not.toHaveBeenCalled();
  });

  it('base en panne: 500 pour que Resend relance', async () => {
    appliquerEvenement.mockRejectedValue(new Error('db'));
    const res = await POST(requete(CORPS));
    expect(res.status).toBe(500);
  });
});
