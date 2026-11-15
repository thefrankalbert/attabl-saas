import { beforeEach, describe, expect, it, vi } from 'vitest';

const processTransaction = vi.fn();
const startPayment = vi.fn();
const runRenewals = vi.fn();
let wiringEnabled = true;

vi.mock('@/lib/billing/flutterwave/wiring', () => ({
  buildFlutterwaveBilling: vi.fn(() =>
    wiringEnabled
      ? {
          config: { secretKey: 'k', webhookHash: 'h' },
          billing: { processTransaction, startPayment },
        }
      : null,
  ),
  runFlutterwaveRenewals: (...args: unknown[]) => runRenewals(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkoutLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  verifyCheckoutLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

const resolveCheckoutTenant = vi.fn();
vi.mock('@/lib/billing/checkout-tenant', () => ({
  resolveCheckoutTenant: (...args: unknown[]) => resolveCheckoutTenant(...args),
}));

import { POST as webhookPOST } from '../webhooks/flutterwave/route';
import { POST as checkoutPOST } from '../billing/flutterwave/checkout/route';
import { POST as confirmPOST } from '../billing/flutterwave/confirm/route';
import { GET as cronGET } from '../cron/flutterwave-renewals/route';
import { checkoutLimiter } from '@/lib/rate-limit';

const HASH = 'super-secret-hash-value';

function webhook(body: unknown, hash?: string): Request {
  return new Request('http://localhost/api/webhooks/flutterwave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(hash ? { 'verif-hash': hash } : {}) },
    body: JSON.stringify(body),
  });
}

function json(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  wiringEnabled = true;
  vi.stubEnv('FLUTTERWAVE_SECRET_KEY', 'FLWSECK-test');
  vi.stubEnv('FLUTTERWAVE_WEBHOOK_HASH', HASH);
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  vi.mocked(checkoutLimiter.check).mockResolvedValue({ success: true } as never);
});

describe('POST /api/webhooks/flutterwave', () => {
  const charge = {
    event: 'charge.completed',
    data: { id: 7001, tx_ref: 'x', status: 'successful' },
  };

  it('sans cles: 503, rien n est traite', async () => {
    vi.stubEnv('FLUTTERWAVE_SECRET_KEY', '');
    vi.stubEnv('FLUTTERWAVE_WEBHOOK_HASH', '');
    const res = await webhookPOST(webhook(charge, HASH));
    expect(res.status).toBe(503);
    expect(processTransaction).not.toHaveBeenCalled();
  });

  it('verif-hash absent ou faux: 401, rien n est traite (temoin negatif)', async () => {
    expect((await webhookPOST(webhook(charge))).status).toBe(401);
    expect((await webhookPOST(webhook(charge, 'mauvais-hash-de-meme-taille!'))).status).toBe(401);
    expect(processTransaction).not.toHaveBeenCalled();
  });

  it('bon verif-hash: la transaction est traitee (temoin positif)', async () => {
    processTransaction.mockResolvedValue({ kind: 'applied' });
    const res = await webhookPOST(webhook(charge, HASH));
    expect(res.status).toBe(200);
    expect(processTransaction).toHaveBeenCalledWith(7001);
    expect(await res.json()).toMatchObject({ applied: true });
  });

  it('doublon: 200 sans erreur, pas de relance', async () => {
    processTransaction.mockResolvedValue({ kind: 'duplicate' });
    const res = await webhookPOST(webhook(charge, HASH));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: false });
  });

  it('paiement rejete (montant, reference inconnue...): 200, non applique', async () => {
    processTransaction.mockResolvedValue({ kind: 'rejected', reason: 'AMOUNT_MISMATCH' });
    const res = await webhookPOST(webhook(charge, HASH));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: false });
  });

  it('evenement etranger (ex: virement): ignore sans toucher aux abonnements', async () => {
    const res = await webhookPOST(webhook({ event: 'transfer.completed', data: { id: 5 } }, HASH));
    expect(res.status).toBe(200);
    expect(processTransaction).not.toHaveBeenCalled();
  });

  it('corps illisible ou sans data.id: 400', async () => {
    expect((await webhookPOST(webhook({ event: 'charge.completed' }, HASH))).status).toBe(400);
  });

  it('panne de verification ou de base: 500, pour que Flutterwave relance', async () => {
    processTransaction.mockRejectedValue(new Error('down'));
    expect((await webhookPOST(webhook(charge, HASH))).status).toBe(500);
  });
});

describe('POST /api/billing/flutterwave/checkout', () => {
  const okTenant = {
    ok: true,
    userId: 'u1',
    email: 'awa@exemple.test',
    tenant: { tenant_id: 't1', tenants: null },
  };

  it('sans cles: 503 propre, la session n est meme pas lue', async () => {
    wiringEnabled = false;
    const res = await checkoutPOST(
      json('http://localhost/api/billing/flutterwave/checkout', { plan: 'pro' }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'FLUTTERWAVE_DISABLED' });
    expect(resolveCheckoutTenant).not.toHaveBeenCalled();
  });

  it('plan invalide: 400, aucun paiement lance', async () => {
    const res = await checkoutPOST(
      json('http://localhost/api/billing/flutterwave/checkout', { plan: 'enterprise' }),
    );
    expect(res.status).toBe(400);
    expect(startPayment).not.toHaveBeenCalled();
  });

  it('non authentifie ou hors du restaurant: le statut de la resolution est repris', async () => {
    resolveCheckoutTenant.mockResolvedValue({ ok: false, status: 403, error: 'Acces refuse' });
    const res = await checkoutPOST(
      json('http://localhost/api/billing/flutterwave/checkout', { plan: 'pro' }),
    );
    expect(res.status).toBe(403);
    expect(startPayment).not.toHaveBeenCalled();
  });

  it('le restaurant vient de la session, jamais du corps (un tenantId injecte est ignore)', async () => {
    resolveCheckoutTenant.mockResolvedValue(okTenant);
    startPayment.mockResolvedValue({ link: 'https://checkout.flutterwave.com/pay/abc' });
    const res = await checkoutPOST(
      json('http://localhost/api/billing/flutterwave/checkout', {
        plan: 'pro',
        billingInterval: 'yearly',
        tenantId: 'autre-restaurant',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.flutterwave.com/pay/abc' });
    expect(startPayment).toHaveBeenCalledWith({
      tenantId: 't1',
      customerEmail: 'awa@exemple.test',
      plan: 'pro',
      interval: 'yearly',
    });
  });

  it('limite de debit depassee: 429', async () => {
    vi.mocked(checkoutLimiter.check).mockResolvedValue({ success: false } as never);
    const res = await checkoutPOST(
      json('http://localhost/api/billing/flutterwave/checkout', { plan: 'pro' }),
    );
    expect(res.status).toBe(429);
  });
});

describe('POST /api/billing/flutterwave/confirm', () => {
  it('sans cles: 503', async () => {
    wiringEnabled = false;
    const res = await confirmPOST(
      json('http://localhost/api/billing/flutterwave/confirm', { transactionId: 7001 }),
    );
    expect(res.status).toBe(503);
  });

  it('passe le restaurant de la session au service (jamais celui du corps)', async () => {
    resolveCheckoutTenant.mockResolvedValue({
      ok: true,
      userId: 'u1',
      email: 'a@b.co',
      tenant: { tenant_id: 't1', tenants: null },
    });
    processTransaction.mockResolvedValue({ kind: 'applied' });
    const res = await confirmPOST(
      json('http://localhost/api/billing/flutterwave/confirm', {
        transactionId: '7001',
        tenantId: 'x',
      }),
    );
    expect(await res.json()).toEqual({ status: 'applied' });
    expect(processTransaction).toHaveBeenCalledWith(7001, 't1');
  });

  it('paiement d un autre restaurant: rejete, pas applique', async () => {
    resolveCheckoutTenant.mockResolvedValue({
      ok: true,
      userId: 'u1',
      email: 'a@b.co',
      tenant: { tenant_id: 't1', tenants: null },
    });
    processTransaction.mockResolvedValue({ kind: 'rejected', reason: 'WRONG_TENANT' });
    const res = await confirmPOST(
      json('http://localhost/api/billing/flutterwave/confirm', { transactionId: 7001 }),
    );
    expect(await res.json()).toEqual({ status: 'rejected' });
  });
});

describe('GET /api/cron/flutterwave-renewals', () => {
  const req = (auth?: string) =>
    new Request('http://localhost/api/cron/flutterwave-renewals', {
      headers: auth ? { authorization: auth } : {},
    });

  it('sans bearer: 401, rien ne tourne', async () => {
    expect((await cronGET(req())).status).toBe(401);
    expect(runRenewals).not.toHaveBeenCalled();
  });

  it('sans CRON_SECRET: 503', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await cronGET(req('Bearer cron-secret'))).status).toBe(503);
  });

  it('fonctionnalite eteinte: 200 enabled=false', async () => {
    runRenewals.mockResolvedValue(null);
    const res = await cronGET(req('Bearer cron-secret'));
    expect(await res.json()).toEqual({ success: true, enabled: false });
  });

  it('autorise: renvoie le compte rendu', async () => {
    runRenewals.mockResolvedValue({ reminded: 2, skipped: 0, frozen: 1 });
    const res = await cronGET(req('Bearer cron-secret'));
    expect(await res.json()).toEqual({
      success: true,
      enabled: true,
      reminded: 2,
      skipped: 0,
      frozen: 1,
    });
  });
});
