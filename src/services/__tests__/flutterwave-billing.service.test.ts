import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '@/lib/logger';
import { createFlutterwaveBillingService } from '../flutterwave-billing.service';
import { buildTxRef } from '@/lib/billing/flutterwave/tx-ref';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import type { VerifiedTransaction } from '@/lib/billing/flutterwave/schemas';
import { createFakeSupabase, type Result } from './helpers/fake-supabase';

// La logique d'application (periode, gel, plan, Stripe, expiration) vit en SQL et est
// mesuree par supabase/tests/rls/flutterwave_payments.test.sql. Ici: l'orchestration.

const NOW = new Date('2026-11-15T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const TENANT_A = '11111111-2222-3333-4444-555555555555';
const TENANT_B = '99999999-2222-3333-4444-555555555555';

type Row = Record<string, unknown>;

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function tenant(overrides: Row = {}): Row {
  return {
    id: TENANT_A,
    slug: 'chez-awa',
    name: 'Chez Awa',
    currency: 'XOF',
    subscription_status: 'trial',
    subscription_plan: 'starter',
    subscription_current_period_end: null,
    stripe_subscription_id: null,
    freeze_reason: null,
    suspended_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function payment(txRef: string, overrides: Row = {}): Row {
  return {
    id: `pay-${txRef.slice(-6)}`,
    tenant_id: TENANT_A,
    tx_ref: txRef,
    plan: 'pro',
    billing_interval: 'monthly',
    amount: 79000,
    currency: 'XOF',
    status: 'pending',
    payment_link: null,
    created_at: iso(-DAY),
    ...overrides,
  };
}

const APPLIED: Result = {
  data: { outcome: 'applied', period_end: '2026-12-15T10:00:00.000Z', unfrozen: false },
  error: null,
};

function setup(opts: {
  tenants?: Row[];
  payments?: Row[];
  rpc?: (args: Row, db: Record<string, Row[]>) => Result;
  stripeStatus?: string | null;
}) {
  const rpc = vi.fn(opts.rpc ?? (() => APPLIED));
  const fake = createFakeSupabase(
    { tenants: opts.tenants ?? [tenant()], flutterwave_payments: opts.payments ?? [] },
    { rpc: { apply_flutterwave_payment: (args, db) => rpc(args, db) } },
  );
  const client: FlutterwaveClient = {
    createPaymentLink: vi.fn().mockResolvedValue('https://checkout.flutterwave.com/pay/xyz'),
    verifyTransaction: vi.fn(),
    verifyByReference: vi.fn(),
    listTransactionsByReference: vi.fn().mockResolvedValue([]),
  };
  const retrieveStripeStatus = vi.fn().mockResolvedValue(opts.stripeStatus ?? null);
  const service = createFlutterwaveBillingService(fake.client, {
    client,
    baseUrl: 'https://attabl.com',
    retrieveStripeStatus,
    now: () => NOW,
  });
  return { ...fake, client, service, rpc, retrieveStripeStatus };
}

function verified(overrides: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    id: 7001,
    tx_ref: 'x',
    status: 'successful',
    amount: 79000,
    currency: 'XOF',
    ...overrides,
  };
}

const REF = buildTxRef(TENANT_A, 'pro', 'monthly', 'aaaaaaaaaaaaaaaa');
const START = { tenantId: TENANT_A, customerEmail: 'a@b.co', interval: 'monthly' as const };

describe('startPayment', () => {
  it('enregistre le prix attendu AVANT d appeler Flutterwave, memorise le lien et le renvoie', async () => {
    const { service, db, client } = setup({});
    const result = await service.startPayment({ ...START, plan: 'pro' });
    expect(result).toMatchObject({
      link: 'https://checkout.flutterwave.com/pay/xyz',
      amount: 79000,
    });
    expect(db.flutterwave_payments).toHaveLength(1);
    expect(db.flutterwave_payments[0]).toMatchObject({
      tenant_id: TENANT_A,
      status: 'pending',
      amount: 79000,
      currency: 'XOF',
      plan: 'pro',
      payment_link: 'https://checkout.flutterwave.com/pay/xyz',
    });
    const call = vi.mocked(client.createPaymentLink).mock.calls[0][0];
    expect(call.redirectUrl).toBe('https://attabl.com/sites/chez-awa/admin/subscription?fw=return');
  });

  it('le prix annuel vient de la source unique', async () => {
    const { service } = setup({ tenants: [tenant({ currency: 'XAF' })] });
    const result = await service.startPayment({ ...START, plan: 'pro', interval: 'yearly' });
    expect(result).toMatchObject({ amount: 758400, currency: 'XAF' });
  });

  it('refuse une devise hors XOF/XAF et un restaurant supprime', async () => {
    const eur = setup({ tenants: [tenant({ currency: 'EUR' })] });
    await expect(eur.service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const gone = setup({ tenants: [tenant({ deleted_at: iso(-DAY) })] });
    await expect(gone.service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('si Flutterwave refuse, la tentative orpheline est effacee', async () => {
    const { service, db, client } = setup({});
    vi.mocked(client.createPaymentLink).mockRejectedValue(new Error('down'));
    await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    expect(db.flutterwave_payments).toHaveLength(0);
  });

  describe('restaurant suspendu ou gele (MEDIUM-A)', () => {
    it('suspendu par le super-admin: CONFLICT lisible, aucune ligne', async () => {
      const { service, db } = setup({ tenants: [tenant({ suspended_at: iso(-DAY) })] });
      await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('suspendu'),
      });
      expect(db.flutterwave_payments).toHaveLength(0);
    });

    it.each(['dispute', null, 'cause_inventee'])(
      'gele pour %s (un paiement ne le leve pas): CONFLICT, aucune ligne',
      async (reason) => {
        const { service, db } = setup({
          tenants: [tenant({ subscription_status: 'frozen', freeze_reason: reason })],
        });
        await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
          code: 'CONFLICT',
          message: expect.stringContaining('gele'),
        });
        expect(db.flutterwave_payments).toHaveLength(0);
      },
    );

    it.each([
      'trial_expired',
      'past_due_overdue',
      'stripe_unpaid',
      'subscription_deleted',
      'refund',
      'flutterwave_unpaid',
    ])(
      'gele pour %s (un paiement le leve): le paiement est ouvert (temoin positif)',
      async (reason) => {
        const { service } = setup({
          tenants: [tenant({ subscription_status: 'frozen', freeze_reason: reason })],
        });
        await expect(service.startPayment({ ...START, plan: 'pro' })).resolves.toBeDefined();
      },
    );
  });

  describe('abonnement Stripe (HIGH-1)', () => {
    it('Stripe vivant (statut local utilisable + identifiant): CONFLICT, aucune ligne', async () => {
      const { service, db } = setup({
        tenants: [tenant({ subscription_status: 'active', stripe_subscription_id: 'sub_1' })],
      });
      await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(db.flutterwave_payments).toHaveLength(0);
    });

    it('identifiant perime, Stripe dit canceled: le paiement est ouvert', async () => {
      const { service, retrieveStripeStatus } = setup({
        tenants: [tenant({ subscription_status: 'cancelled', stripe_subscription_id: 'sub_old' })],
        stripeStatus: 'canceled',
      });
      await expect(service.startPayment({ ...START, plan: 'pro' })).resolves.toMatchObject({
        amount: 79000,
      });
      expect(retrieveStripeStatus).toHaveBeenCalledWith('sub_old');
    });

    it('identifiant perime, Stripe ne le connait plus (404): le paiement est ouvert', async () => {
      const { service } = setup({
        tenants: [
          tenant({
            subscription_status: 'frozen',
            freeze_reason: 'subscription_deleted',
            stripe_subscription_id: 'sub_gone',
          }),
        ],
        stripeStatus: null,
      });
      await expect(service.startPayment({ ...START, plan: 'pro' })).resolves.toBeDefined();
    });

    it('identifiant present, statut local gele, Stripe dit unpaid (vivant): CONFLICT (temoin negatif)', async () => {
      const { service } = setup({
        tenants: [
          tenant({
            subscription_status: 'frozen',
            freeze_reason: 'stripe_unpaid',
            stripe_subscription_id: 'sub_1',
          }),
        ],
        stripeStatus: 'unpaid',
      });
      await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('Stripe injoignable: refus, jamais une caisse ouverte dans le doute', async () => {
      const { service, db, retrieveStripeStatus } = setup({
        tenants: [tenant({ subscription_status: 'cancelled', stripe_subscription_id: 'sub_1' })],
      });
      retrieveStripeStatus.mockRejectedValue(new Error('stripe down'));
      await expect(service.startPayment({ ...START, plan: 'pro' })).rejects.toMatchObject({
        code: 'INTERNAL',
      });
      expect(db.flutterwave_payments).toHaveLength(0);
    });
  });

  describe('changement de plan en cours de periode (HIGH-2)', () => {
    const active = (endOffsetMs: number | null) =>
      tenant({
        subscription_status: 'active',
        subscription_plan: 'pro',
        subscription_current_period_end: endOffsetMs === null ? null : iso(endOffsetMs),
      });

    it('meme plan: renouvellement possible a tout moment', async () => {
      const { service } = setup({ tenants: [active(20 * DAY)] });
      await expect(service.startPayment({ ...START, plan: 'pro' })).resolves.toBeDefined();
    });

    it('autre plan avec plus d un jour restant: CONFLICT avec la date d echeance', async () => {
      const { service, db } = setup({ tenants: [active(10 * DAY)] });
      await expect(service.startPayment({ ...START, plan: 'starter' })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: "Changement d'offre possible a l'echeance du 25/11/2026.",
      });
      expect(db.flutterwave_payments).toHaveLength(0);
    });

    it('autre plan a moins d un jour de l echeance: autorise', async () => {
      const { service } = setup({ tenants: [active(DAY / 2)] });
      await expect(service.startPayment({ ...START, plan: 'business' })).resolves.toBeDefined();
    });

    it('autre plan sans periode payee (essai, gele, jamais paye): autorise', async () => {
      const { service } = setup({ tenants: [tenant()] });
      await expect(service.startPayment({ ...START, plan: 'business' })).resolves.toBeDefined();
      const frozen = setup({
        tenants: [
          tenant({
            subscription_status: 'frozen',
            freeze_reason: 'trial_expired',
            subscription_plan: 'pro',
          }),
        ],
      });
      await expect(
        frozen.service.startPayment({ ...START, plan: 'starter' }),
      ).resolves.toBeDefined();
    });
  });

  describe('reutilisation des tentatives (L3)', () => {
    it('une tentative non expiree, meme plan et meme prix, est reutilisee: meme lien, aucune nouvelle ligne', async () => {
      const { service, db, client } = setup({
        payments: [payment(REF, { payment_link: 'https://checkout.flutterwave.com/pay/old' })],
      });
      const result = await service.startPayment({ ...START, plan: 'pro' });
      expect(result.link).toBe('https://checkout.flutterwave.com/pay/old');
      expect(result.txRef).toBe(REF);
      expect(db.flutterwave_payments).toHaveLength(1);
      expect(client.createPaymentLink).not.toHaveBeenCalled();
    });

    it('une tentative de plus de 7 jours n est PAS reutilisee (temoin negatif)', async () => {
      const { service, db, client } = setup({
        payments: [
          payment(REF, {
            payment_link: 'https://checkout.flutterwave.com/pay/old',
            created_at: iso(-8 * DAY),
          }),
        ],
      });
      const result = await service.startPayment({ ...START, plan: 'pro' });
      expect(result.link).toBe('https://checkout.flutterwave.com/pay/xyz');
      expect(db.flutterwave_payments).toHaveLength(2);
      expect(client.createPaymentLink).toHaveBeenCalledTimes(1);
    });

    it('une tentative a l ancien prix ou pour un autre plan n est pas reutilisee', async () => {
      const { service, db } = setup({
        payments: [
          payment(REF, { payment_link: 'https://old', amount: 70000 }),
          payment(buildTxRef(TENANT_A, 'starter', 'monthly', 'bbbbbbbbbbbbbbbb'), {
            plan: 'starter',
            amount: 39000,
            payment_link: 'https://starter',
          }),
        ],
      });
      const result = await service.startPayment({ ...START, plan: 'pro' });
      expect(result.link).toBe('https://checkout.flutterwave.com/pay/xyz');
      expect(db.flutterwave_payments).toHaveLength(3);
    });

    it('une tentative d un autre restaurant n est jamais reutilisee', async () => {
      const { service } = setup({
        payments: [payment(REF, { tenant_id: TENANT_B, payment_link: 'https://autre-restaurant' })],
      });
      const result = await service.startPayment({ ...START, plan: 'pro' });
      expect(result.link).toBe('https://checkout.flutterwave.com/pay/xyz');
    });
  });
});

describe('processTransaction: rejets avant la base (temoins negatifs)', () => {
  it('une transaction non reussie ne change rien', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, status: 'failed' }),
    );
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'NOT_SUCCESSFUL',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un sous-paiement d un franc est rejete, un surplus est accepte', async () => {
    const under = setup({ payments: [payment(REF)] });
    vi.mocked(under.client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, amount: 78999 }),
    );
    expect(await under.service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'AMOUNT_MISMATCH',
    });
    expect(under.rpc).not.toHaveBeenCalled();

    const over = setup({ payments: [payment(REF)] });
    vi.mocked(over.client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, amount: 79500 }),
    );
    expect((await over.service.processTransaction(7001)).kind).toBe('applied');
  });

  it('une devise differente est rejetee', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, currency: 'XAF' }),
    );
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'CURRENCY_MISMATCH',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reference inconnue, etrangere ou dont la ligne nomme un autre restaurant: rejetee', async () => {
    const none = setup({ payments: [] });
    vi.mocked(none.client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await none.service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'UNKNOWN_TX_REF',
    });

    const foreign = setup({ payments: [payment(REF)] });
    vi.mocked(foreign.client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: 'boutique-9' }),
    );
    expect((await foreign.service.processTransaction(7001)).kind).toBe('rejected');

    const refB = buildTxRef(TENANT_B, 'pro', 'monthly', 'cccccccccccccccc');
    const mixed = setup({ payments: [payment(refB, { tenant_id: TENANT_A })] });
    vi.mocked(mixed.client.verifyTransaction).mockResolvedValue(verified({ tx_ref: refB }));
    expect((await mixed.service.processTransaction(7001)).kind).toBe('rejected');
    expect(mixed.rpc).not.toHaveBeenCalled();
  });

  it('un autre restaurant que celui de la session est rejete', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001, TENANT_B)).toEqual({
      kind: 'rejected',
      reason: 'WRONG_TENANT',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('une ligne deja traitee (successful ou rejetee) est un doublon, sans toucher a la base', async () => {
    for (const status of ['successful', 'rejected_conflict']) {
      const { service, client, rpc } = setup({ payments: [payment(REF, { status })] });
      vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
      expect(await service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  describe('reference deja reglee (L-1)', () => {
    it('la MEME transaction rejouee est un doublon ordinaire, sans journal d erreur (temoin negatif)', async () => {
      vi.mocked(logger.error).mockClear();
      const { service, client, rpc } = setup({
        payments: [payment(REF, { status: 'successful', flw_transaction_id: 7001 })],
      });
      vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF, id: 7001 }));
      expect(await service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
      expect(logger.error).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('UNE AUTRE transaction sur une reference deja reglee: rejet + journal avec les deux identifiants', async () => {
      vi.mocked(logger.error).mockClear();
      const { service, client, rpc } = setup({
        payments: [payment(REF, { status: 'successful', flw_transaction_id: 7001 })],
      });
      vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF, id: 7002 }));
      expect(await service.processTransaction(7002)).toEqual({
        kind: 'rejected',
        reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('remboursement a faire'),
        expect.objectContaining({
          txRef: REF,
          recordedFlwTransactionId: 7001,
          flwTransactionId: 7002,
        }),
      );
      expect(rpc).not.toHaveBeenCalled();
    });

    it('une ligne rejetee dont la transaction enregistree differe est signalee de la meme facon', async () => {
      vi.mocked(logger.error).mockClear();
      const { service, client } = setup({
        payments: [payment(REF, { status: 'rejected_conflict', flw_transaction_id: 7001 })],
      });
      vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF, id: 7003 }));
      expect((await service.processTransaction(7003)).kind).toBe('rejected');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  it('restaurant supprime: rejete', async () => {
    const { service, client, rpc } = setup({
      tenants: [tenant({ deleted_at: iso(-DAY) })],
      payments: [payment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'TENANT_NOT_FOUND',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('processTransaction: appel de la fonction SQL atomique', () => {
  it('passe la ligne, la transaction, le montant paye, le prix actuel et l horloge', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF, amount: 79500 }));
    const outcome = await service.processTransaction(7001, TENANT_A);
    expect(outcome).toMatchObject({
      kind: 'applied',
      tenantId: TENANT_A,
      plan: 'pro',
      periodEnd: '2026-12-15T10:00:00.000Z',
    });
    expect(rpc).toHaveBeenCalledWith(
      {
        p_payment_id: `pay-${REF.slice(-6)}`,
        p_flw_transaction_id: 7001,
        p_paid_amount: 79500,
        p_current_price: 79000,
        p_stripe_live: false,
        p_now: NOW.toISOString(),
      },
      expect.anything(),
    );
  });

  it('abonnement Stripe vivant: p_stripe_live=true (MEDIUM-2)', async () => {
    const { service, client, rpc } = setup({
      tenants: [tenant({ subscription_status: 'active', stripe_subscription_id: 'sub_1' })],
      payments: [payment(REF)],
      rpc: () => ({ data: { outcome: 'rejected_conflict' }, error: null }),
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'STRIPE_CONFLICT',
    });
    expect(rpc.mock.calls[0][0]).toMatchObject({ p_stripe_live: true });
  });

  it('identifiant Stripe perime (Stripe dit canceled): p_stripe_live=false, le paiement s applique', async () => {
    const { service, client, rpc } = setup({
      tenants: [tenant({ subscription_status: 'cancelled', stripe_subscription_id: 'sub_old' })],
      payments: [payment(REF)],
      stripeStatus: 'canceled',
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect((await service.processTransaction(7001)).kind).toBe('applied');
    expect(rpc.mock.calls[0][0]).toMatchObject({ p_stripe_live: false });
  });

  it('Stripe injoignable: ca leve (le webhook repondra 500 et sera relance), la base n est pas appelee', async () => {
    const { service, client, rpc, retrieveStripeStatus } = setup({
      tenants: [tenant({ subscription_status: 'frozen', stripe_subscription_id: 'sub_1' })],
      payments: [payment(REF)],
    });
    retrieveStripeStatus.mockRejectedValue(new Error('stripe down'));
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await expect(service.processTransaction(7001)).rejects.toThrow('stripe down');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['rejected_plan_change', 'PLAN_CHANGE_NOT_ALLOWED'],
    ['rejected_expired', 'EXPIRED_UNDERPAID'],
    ['rejected_conflict', 'STRIPE_CONFLICT'],
    ['rejected_blocked', 'TENANT_BLOCKED'],
  ])('issue SQL %s: rejet %s, journalise en ERREUR pour remboursement', async (outcome, reason) => {
    vi.mocked(logger.error).mockClear();
    const { service, client } = setup({
      payments: [payment(REF)],
      rpc: () => ({ data: { outcome }, error: null }),
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001)).toEqual({ kind: 'rejected', reason });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('remboursement a faire'),
      expect.objectContaining({ flwTransactionId: 7001, reason }),
    );
  });

  it('issue SQL duplicate: doublon', async () => {
    const { service, client } = setup({
      payments: [payment(REF)],
      rpc: () => ({ data: { outcome: 'duplicate' }, error: null }),
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
  });

  it('erreur SQL ou issue inconnue: ca leve (webhook en 500, rejeu sur: la fonction est idempotente)', async () => {
    const failing = setup({
      payments: [payment(REF)],
      rpc: () => ({ data: null, error: { message: 'boom' } }),
    });
    vi.mocked(failing.client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await expect(failing.service.processTransaction(7001)).rejects.toMatchObject({
      code: 'INTERNAL',
    });

    const odd = setup({
      payments: [payment(REF)],
      rpc: () => ({ data: { outcome: 'bizarre' }, error: null }),
    });
    vi.mocked(odd.client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await expect(odd.service.processTransaction(7001)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('une panne de l API de verification remonte', async () => {
    const { service, client } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyTransaction).mockRejectedValue(new Error('down'));
    await expect(service.processTransaction(7001)).rejects.toThrow('down');
  });
});

describe('cycle de vie: identifiant Stripe perime -> paiement -> renouvellement', () => {
  it('apres le paiement l identifiant est efface, et le renouvellement du meme plan est accepte', async () => {
    const { service, client, db, retrieveStripeStatus } = setup({
      tenants: [tenant({ subscription_status: 'cancelled', stripe_subscription_id: 'sub_old' })],
      stripeStatus: 'canceled',
      // Reproduit l effet de la fonction SQL (mesuree en pgTAP) sur la base factice.
      rpc: (_args, state) => {
        Object.assign(state.tenants[0], {
          subscription_status: 'active',
          subscription_plan: 'pro',
          stripe_subscription_id: null,
          subscription_current_period_end: '2026-12-15T10:00:00.000Z',
        });
        Object.assign(state.flutterwave_payments[0], { status: 'successful' });
        return APPLIED;
      },
    });

    const started = await service.startPayment({ ...START, plan: 'pro' });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: started.txRef }));
    expect((await service.processTransaction(7001)).kind).toBe('applied');
    expect(db.tenants[0].stripe_subscription_id).toBeNull();

    retrieveStripeStatus.mockClear();
    vi.mocked(client.createPaymentLink).mockResolvedValue(
      'https://checkout.flutterwave.com/pay/renew',
    );
    // Renouvellement 6 jours avant l echeance: meme plan, aucune question posee a Stripe.
    const renewal = await createFlutterwaveBillingService(
      createFakeSupabase({ tenants: db.tenants, flutterwave_payments: db.flutterwave_payments })
        .client,
      {
        client,
        baseUrl: 'https://attabl.com',
        retrieveStripeStatus,
        now: () => new Date('2026-12-09T10:00:00.000Z'),
      },
    ).startPayment({ ...START, plan: 'pro' });
    expect(renewal.amount).toBe(79000);
    expect(retrieveStripeStatus).not.toHaveBeenCalled();
  });
});

describe('reconcilePending (rattrapage)', () => {
  const REF2 = buildTxRef(TENANT_A, 'pro', 'monthly', 'dddddddddddddddd');

  it('une tentative payee mais jamais confirmee par webhook est appliquee, par reference', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyByReference).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.reconcilePending()).toEqual({ checked: 1, applied: 1, errors: 0 });
    expect(client.verifyByReference).toHaveBeenCalledWith(REF);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reference inconnue de Flutterwave, ou transaction non reussie: rien n est applique (temoin negatif)', async () => {
    const unknown = setup({ payments: [payment(REF)] });
    vi.mocked(unknown.client.verifyByReference).mockResolvedValue(null);
    expect(await unknown.service.reconcilePending()).toEqual({ checked: 1, applied: 0, errors: 0 });
    expect(unknown.rpc).not.toHaveBeenCalled();

    const failed = setup({ payments: [payment(REF)] });
    vi.mocked(failed.client.verifyByReference).mockResolvedValue(
      verified({ tx_ref: REF, status: 'failed' }),
    );
    expect((await failed.service.reconcilePending()).applied).toBe(0);
    expect(failed.rpc).not.toHaveBeenCalled();
  });

  it('ne regarde que les tentatives pending des 7 derniers jours', async () => {
    const { service, client } = setup({
      payments: [
        payment(REF, { created_at: iso(-8 * DAY) }),
        payment(REF2, { status: 'successful' }),
      ],
    });
    expect(await service.reconcilePending()).toEqual({ checked: 0, applied: 0, errors: 0 });
    expect(client.verifyByReference).not.toHaveBeenCalled();
  });

  it('idempotent: un second passage ne reapplique pas (la ligne n est plus pending)', async () => {
    const { service, client, rpc } = setup({
      payments: [payment(REF)],
      rpc: (_args, state) => {
        Object.assign(state.flutterwave_payments[0], { status: 'successful' });
        return APPLIED;
      },
    });
    vi.mocked(client.verifyByReference).mockResolvedValue(verified({ tx_ref: REF }));
    expect((await service.reconcilePending()).applied).toBe(1);
    expect((await service.reconcilePending()).checked).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('le lot tourne: les lignes jamais verifiees passent avant, et chaque ligne est marquee', async () => {
    const { service, client, db } = setup({
      payments: [
        payment(REF, { last_checked_at: iso(-DAY) }),
        payment(REF2, { last_checked_at: null }),
      ],
    });
    vi.mocked(client.verifyByReference).mockResolvedValue(null);
    await service.reconcilePending(1);
    expect(client.verifyByReference).toHaveBeenCalledWith(REF2);
    expect(db.flutterwave_payments.find((p) => p.tx_ref === REF2)?.last_checked_at).toBe(
      NOW.toISOString(),
    );
  });

  it('derniere tentative echouee mais une plus ancienne reussie (L-2): la liste la retrouve et l applique', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyByReference).mockResolvedValue(
      verified({ tx_ref: REF, id: 7100, status: 'failed' }),
    );
    vi.mocked(client.listTransactionsByReference).mockResolvedValue([
      verified({ tx_ref: REF, id: 7100, status: 'failed' }),
      verified({ tx_ref: REF, id: 7099, status: 'successful' }),
    ]);
    expect(await service.reconcilePending()).toEqual({ checked: 1, applied: 1, errors: 0 });
    expect(client.listTransactionsByReference).toHaveBeenCalledWith(REF);
    expect(rpc.mock.calls[0][0]).toMatchObject({ p_flw_transaction_id: 7099 });
  });

  it('derniere tentative echouee et aucune reussie dans la liste: rien n est applique (temoin negatif)', async () => {
    const { service, client, rpc } = setup({ payments: [payment(REF)] });
    vi.mocked(client.verifyByReference).mockResolvedValue(
      verified({ tx_ref: REF, status: 'failed' }),
    );
    vi.mocked(client.listTransactionsByReference).mockResolvedValue([
      verified({ tx_ref: REF, status: 'failed' }),
    ]);
    expect((await service.reconcilePending()).applied).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('la liste n est consultee que si une tentative existe et n est pas reussie (pas de requete inutile)', async () => {
    const never = setup({ payments: [payment(REF)] });
    vi.mocked(never.client.verifyByReference).mockResolvedValue(null);
    await never.service.reconcilePending();
    expect(never.client.listTransactionsByReference).not.toHaveBeenCalled();

    const ok = setup({ payments: [payment(REF)] });
    vi.mocked(ok.client.verifyByReference).mockResolvedValue(verified({ tx_ref: REF }));
    await ok.service.reconcilePending();
    expect(ok.client.listTransactionsByReference).not.toHaveBeenCalled();
  });

  it('une ligne qui echoue est comptee, marquee, et n arrete pas les suivantes', async () => {
    const { service, client, db } = setup({
      payments: [payment(REF, { created_at: iso(-2 * DAY) }), payment(REF2)],
    });
    vi.mocked(client.verifyByReference)
      .mockRejectedValueOnce(new Error('flutterwave down'))
      .mockResolvedValueOnce(null);
    const result = await service.reconcilePending();
    expect(result).toEqual({ checked: 2, applied: 0, errors: 1 });
    expect(db.flutterwave_payments.every((p) => p.last_checked_at === NOW.toISOString())).toBe(
      true,
    );
  });
});
