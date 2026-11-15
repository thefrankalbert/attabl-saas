import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureCheckIn = vi.fn(() => 'check-in-1');
const flush = vi.fn(async () => true);
vi.mock('@sentry/nextjs', () => ({ captureCheckIn, flush }));
type Ecriture = Promise<{ error: { message: string } | null }>;
const ecrire = vi.fn<() => Ecriture>(async () => ({ error: null }));
type Upsert = (
  row: Record<string, unknown>,
  opts: unknown,
) => { abortSignal: (signal: AbortSignal) => Ecriture };
const upsert = vi.fn<Upsert>(() => ({ abortSignal: () => ecrire() }));
const from = vi.fn<(table: string) => { upsert: typeof upsert }>(() => ({ upsert }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

const { surveillerCron } = await import('../cron-monitor');

const requete = (secret?: string) =>
  new Request('https://attabl.com/api/cron/x', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

describe('surveillerCron', () => {
  beforeEach(() => {
    captureCheckIn.mockClear();
    upsert.mockClear();
    from.mockClear();
    process.env.CRON_SECRET = 'secret-de-test';
  });

  it('ne signale rien a Sentry pour un appel sans le secret (temoin negatif)', async () => {
    const res = await surveillerCron(requete('mauvais'), 'x', '0 2 * * *', async () =>
      Response.json({}, { status: 401 }),
    );
    expect(res.status).toBe(401);
    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
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

  it('compte une reponse 4xx comme un passage en erreur', async () => {
    await surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () =>
      Response.json({}, { status: 404 }),
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

  it('note le battement du passage (tache, frequence, resultat)', async () => {
    await surveillerCron(requete('secret-de-test'), 'reminders', '* * * * *', async () =>
      Response.json({ success: true }),
    );
    expect(from).toHaveBeenCalledWith('cron_heartbeats');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'reminders', schedule: '* * * * *', last_status: 'ok' }),
      { onConflict: 'job' },
    );
  });

  it('note un battement en erreur quand la tache leve une exception', async () => {
    await expect(
      surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () => {
        throw new Error('panne');
      }),
    ).rejects.toThrow('panne');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_status: 'error' }),
      expect.anything(),
    );
  });

  it('ne fait pas echouer la tache si le battement ne peut pas etre ecrit', async () => {
    ecrire.mockRejectedValueOnce(new Error('base indisponible'));
    const res = await surveillerCron(requete('secret-de-test'), 'x', '0 2 * * *', async () =>
      Response.json({ success: true }),
    );
    expect(res.status).toBe(200);
  });
});
