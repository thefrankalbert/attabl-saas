import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getFlutterwaveConfig, isFlutterwaveConfigured, isFlutterwaveCurrency } from '../config';
import { buildTxRef, parseTxRef } from '../tx-ref';
import { isValidWebhookHash } from '../webhook-hash';
import { createFlutterwaveClient, FlutterwaveApiError } from '../client';

const TENANT = '11111111-2222-3333-4444-555555555555';

describe('config: la fonctionnalite est eteinte sans cles', () => {
  it('sans aucune variable: eteinte', () => {
    expect(getFlutterwaveConfig({})).toBeNull();
    expect(isFlutterwaveConfigured({})).toBe(false);
  });

  it('une seule des deux variables ne suffit pas (temoin negatif)', () => {
    expect(isFlutterwaveConfigured({ FLUTTERWAVE_SECRET_KEY: 'k' })).toBe(false);
    expect(isFlutterwaveConfigured({ FLUTTERWAVE_WEBHOOK_HASH: 'h' })).toBe(false);
    expect(
      isFlutterwaveConfigured({ FLUTTERWAVE_SECRET_KEY: '  ', FLUTTERWAVE_WEBHOOK_HASH: 'h' }),
    ).toBe(false);
  });

  it('les deux variables: allumee (temoin positif)', () => {
    expect(
      getFlutterwaveConfig({ FLUTTERWAVE_SECRET_KEY: 'k', FLUTTERWAVE_WEBHOOK_HASH: 'h' }),
    ).toEqual({ secretKey: 'k', webhookHash: 'h' });
  });

  it('seules XOF et XAF sont encaissables', () => {
    expect(isFlutterwaveCurrency('XOF')).toBe(true);
    expect(isFlutterwaveCurrency('XAF')).toBe(true);
    expect(isFlutterwaveCurrency('EUR')).toBe(false);
    expect(isFlutterwaveCurrency(null)).toBe(false);
  });
});

describe('tx_ref', () => {
  it('fait l aller-retour', () => {
    const ref = buildTxRef(TENANT, 'pro', 'yearly', 'abcdef0123456789');
    expect(ref).toBe(`atb_${TENANT}_pro_yearly_abcdef0123456789`);
    expect(parseTxRef(ref)).toEqual({
      tenantId: TENANT,
      plan: 'pro',
      interval: 'yearly',
      nonce: 'abcdef0123456789',
    });
  });

  it('deux references du meme restaurant different (nonce)', () => {
    expect(buildTxRef(TENANT, 'pro', 'monthly')).not.toBe(buildTxRef(TENANT, 'pro', 'monthly'));
  });

  it('rejette une reference etrangere ou mal formee', () => {
    expect(parseTxRef('autre-produit-123')).toBeNull();
    expect(parseTxRef(`atb_${TENANT}_enterprise_monthly_abcdef0123456789`)).toBeNull();
    expect(parseTxRef(`atb_pas-un-uuid_pro_monthly_abcdef0123456789`)).toBeNull();
  });
});

describe('verif-hash', () => {
  it('accepte le secret exact', () => {
    expect(isValidWebhookHash('secret-hash-123', 'secret-hash-123')).toBe(true);
  });

  it('rejette un secret faux, de longueur differente, absent ou vide', () => {
    expect(isValidWebhookHash('secret-hash-124', 'secret-hash-123')).toBe(false);
    expect(isValidWebhookHash('court', 'secret-hash-123')).toBe(false);
    expect(isValidWebhookHash(null, 'secret-hash-123')).toBe(false);
    expect(isValidWebhookHash('', '')).toBe(false);
  });
});

describe('client Flutterwave', () => {
  const okJson = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('cree un lien: cle en en-tete, montant entier, devise, reference', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        status: 'success',
        data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' },
      }),
    );
    const client = createFlutterwaveClient('FLWSECK-test', fetchImpl as unknown as typeof fetch);
    const link = await client.createPaymentLink({
      txRef: 'ref1',
      amount: 79000,
      currency: 'XOF',
      redirectUrl: 'https://attabl.com/retour',
      customer: { email: 'a@b.co', name: 'Resto' },
      title: 'ATTABL',
      description: 'Abonnement pro',
      meta: { tenant_id: 't' },
    });
    expect(link).toBe('https://checkout.flutterwave.com/v3/hosted/pay/abc');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.flutterwave.com/v3/payments');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer FLWSECK-test');
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({ tx_ref: 'ref1', amount: 79000, currency: 'XOF' });
  });

  it('verifie une transaction', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        status: 'success',
        data: {
          id: 42,
          tx_ref: 'ref1',
          status: 'successful',
          amount: 79000,
          currency: 'XOF',
          extra: 1,
        },
      }),
    );
    const client = createFlutterwaveClient('k', fetchImpl as unknown as typeof fetch);
    const tx = await client.verifyTransaction(42);
    expect(tx).toMatchObject({ id: 42, tx_ref: 'ref1', status: 'successful' });
    expect((fetchImpl.mock.calls[0] as [string])[0]).toBe(
      'https://api.flutterwave.com/v3/transactions/42/verify',
    );
  });

  it('une reponse mal formee est une erreur, pas un paiement', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ status: 'success', data: { id: 'x' } }));
    const client = createFlutterwaveClient('k', fetchImpl as unknown as typeof fetch);
    await expect(client.verifyTransaction(1)).rejects.toBeInstanceOf(FlutterwaveApiError);
  });

  it('un statut HTTP en erreur leve, sans exposer la cle', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ message: 'no' }, 401));
    const client = createFlutterwaveClient('FLWSECK-secret', fetchImpl as unknown as typeof fetch);
    const err = await client.verifyTransaction(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlutterwaveApiError);
    expect((err as Error).message).not.toContain('FLWSECK-secret');
  });

  it('un reseau en panne leve une FlutterwaveApiError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const client = createFlutterwaveClient('k', fetchImpl as unknown as typeof fetch);
    await expect(client.verifyTransaction(1)).rejects.toBeInstanceOf(FlutterwaveApiError);
  });

  describe('verifyByReference', () => {
    const body = {
      status: 'success',
      data: { id: 42, tx_ref: 'ref1', status: 'successful', amount: 79000, currency: 'XOF' },
    };

    it('appelle verify_by_reference avec la reference encodee', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okJson(body));
      const client = createFlutterwaveClient('k', fetchImpl as unknown as typeof fetch);
      expect(await client.verifyByReference('atb_a b')).toMatchObject({ id: 42 });
      expect((fetchImpl.mock.calls[0] as [string])[0]).toBe(
        'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=atb_a%20b',
      );
    });

    it('reference inconnue (404, 400 ou corps status error): null, pas une panne', async () => {
      for (const res of [
        okJson({ message: 'x' }, 404),
        okJson({ message: 'x' }, 400),
        okJson({ status: 'error', data: null }),
      ]) {
        const client = createFlutterwaveClient(
          'k',
          vi.fn().mockResolvedValue(res) as unknown as typeof fetch,
        );
        expect(await client.verifyByReference('ref')).toBeNull();
      }
    });

    it('une vraie panne (500, reseau) leve (temoin negatif)', async () => {
      const server = createFlutterwaveClient(
        'k',
        vi.fn().mockResolvedValue(okJson({}, 500)) as unknown as typeof fetch,
      );
      await expect(server.verifyByReference('ref')).rejects.toBeInstanceOf(FlutterwaveApiError);
      const network = createFlutterwaveClient(
        'k',
        vi.fn().mockRejectedValue(new Error('x')) as unknown as typeof fetch,
      );
      await expect(network.verifyByReference('ref')).rejects.toBeInstanceOf(FlutterwaveApiError);
    });

    it('une reponse mal formee leve', async () => {
      const client = createFlutterwaveClient(
        'k',
        vi
          .fn()
          .mockResolvedValue(
            okJson({ status: 'success', data: { id: 'x' } }),
          ) as unknown as typeof fetch,
      );
      await expect(client.verifyByReference('ref')).rejects.toBeInstanceOf(FlutterwaveApiError);
    });
  });

  describe('listTransactionsByReference', () => {
    const item = (over: Record<string, unknown>) => ({
      id: '989226',
      tx_ref: 'ref1',
      status: 'successful',
      amount: 79000,
      currency: 'XOF',
      ...over,
    });

    it('appelle GET /transactions?tx_ref=, convertit l identifiant (chaine -> nombre) et ne garde que la reference EXACTE', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        okJson({
          status: 'success',
          data: [
            item({}),
            item({ id: 5, tx_ref: 'autre-reference' }),
            item({ id: 7, status: 'failed' }),
          ],
        }),
      );
      const client = createFlutterwaveClient('k', fetchImpl as unknown as typeof fetch);
      const list = await client.listTransactionsByReference('ref1');
      expect((fetchImpl.mock.calls[0] as [string])[0]).toBe(
        'https://api.flutterwave.com/v3/transactions?tx_ref=ref1',
      );
      expect(list.map((t) => t.id)).toEqual([989226, 7]);
    });

    it('inconnue (400, 404, status error): liste vide; vraie panne ou corps mal forme: leve', async () => {
      for (const res of [
        okJson({}, 404),
        okJson({}, 400),
        okJson({ status: 'error', data: null }),
      ]) {
        const client = createFlutterwaveClient(
          'k',
          vi.fn().mockResolvedValue(res) as unknown as typeof fetch,
        );
        expect(await client.listTransactionsByReference('ref1')).toEqual([]);
      }
      const down = createFlutterwaveClient(
        'k',
        vi.fn().mockResolvedValue(okJson({}, 500)) as unknown as typeof fetch,
      );
      await expect(down.listTransactionsByReference('ref1')).rejects.toBeInstanceOf(
        FlutterwaveApiError,
      );
      const odd = createFlutterwaveClient(
        'k',
        vi
          .fn()
          .mockResolvedValue(okJson({ status: 'success', data: 'x' })) as unknown as typeof fetch,
      );
      await expect(odd.listTransactionsByReference('ref1')).rejects.toBeInstanceOf(
        FlutterwaveApiError,
      );
    });
  });
});
