import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureCheckIn = vi.fn(() => 'check-in-1');
const flush = vi.fn(async () => true);
vi.mock('@sentry/nextjs', () => ({ captureCheckIn, flush }));

const { surveillerCron } = await import('../cron-monitor');

const requete = (secret?: string) =>
  new Request('https://attabl.com/api/cron/x', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

describe('surveillerCron', () => {
  beforeEach(() => {
    captureCheckIn.mockClear();
    process.env.CRON_SECRET = 'secret-de-test';
  });

  it('ne signale rien a Sentry pour un appel sans le secret (temoin negatif)', async () => {
    const res = await surveillerCron(requete('mauvais'), 'x', '0 2 * * *', async () =>
      Response.json({}, { status: 401 }),
    );
    expect(res.status).toBe(401);
    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it('signale un passage reussi', async () => {
    await surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () =>
      Response.json({ success: true }),
    );
    expect(captureCheckIn).toHaveBeenCalledTimes(2);
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ checkInId: 'check-in-1', status: 'ok' }),
    );
  });

  it('signale une erreur sur une reponse 500', async () => {
    await surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () =>
      Response.json({}, { status: 500 }),
    );
    expect(captureCheckIn).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('signale une erreur quand la tache leve une exception', async () => {
    await expect(
      surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () => {
        throw new Error('panne');
      }),
    ).rejects.toThrow('panne');
    expect(captureCheckIn).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  });
});
