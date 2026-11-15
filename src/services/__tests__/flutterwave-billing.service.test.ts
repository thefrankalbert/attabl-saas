import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createFlutterwaveBillingService } from '../flutterwave-billing.service';
import { ServiceError } from '../errors';
import { buildTxRef } from '@/lib/billing/flutterwave/tx-ref';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import type { VerifiedTransaction } from '@/lib/billing/flutterwave/schemas';
import { createFakeSupabase } from './helpers/fake-supabase';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const TENANT_A = '11111111-2222-3333-4444-555555555555';
const TENANT_B = '99999999-2222-3333-4444-555555555555';

type Row = Record<string, unknown>;

function tenant(overrides: Row = {}): Row {
  return {
    id: TENANT_A,
    slug: 'chez-awa',
    name: 'Chez Awa',
    currency: 'XOF',
    subscription_status: 'trial',
    subscription_plan: 'starter',
    subscription_current_period_end: null,
    trial_ends_at: null,
    freeze_reason: null,
    stripe_subscription_id: null,
    suspended_at: null,
    deleted_at: null,
    is_active: true,
    past_due_since: null,
    ...overrides,
  };
}

function pendingPayment(txRef: string, overrides: Row = {}): Row {
  return {
    id: `pay-${txRef.slice(-6)}`,
    tenant_id: TENANT_A,
    tx_ref: txRef,
    flw_transaction_id: null,
    plan: 'pro',
    billing_interval: 'monthly',
    amount: 79000,
    currency: 'XOF',
    status: 'pending',
    period_start: null,
    period_end: null,
    ...overrides,
  };
}

function setup(opts: { tenants?: Row[]; payments?: Row[]; failTenantUpdate?: boolean }) {
  const fake = createFakeSupabase(
    { tenants: opts.tenants ?? [tenant()], flutterwave_payments: opts.payments ?? [] },
    {
      uniques: { flutterwave_payments: ['tx_ref', 'flw_transaction_id'] },
      failWrite: (table, op) => !!opts.failTenantUpdate && table === 'tenants' && op === 'update',
    },
  );
  const client: FlutterwaveClient = {
    createPaymentLink: vi.fn().mockResolvedValue('https://checkout.flutterwave.com/pay/xyz'),
    verifyTransaction: vi.fn(),
  };
  const service = createFlutterwaveBillingService(fake.client, {
    client,
    baseUrl: 'https://attabl.com',
    now: () => NOW,
  });
  return { ...fake, client, service };
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

function tenantRow(db: Record<string, Row[]>, id = TENANT_A): Row {
  return db.tenants.find((t) => t.id === id) as Row;
}

describe('startPayment', () => {
  it('enregistre le prix attendu AVANT d appeler Flutterwave et renvoie le lien', async () => {
    const { service, db, client } = setup({});
    const result = await service.startPayment({
      tenantId: TENANT_A,
      customerEmail: 'awa@exemple.test',
      plan: 'pro',
      interval: 'monthly',
    });
    expect(result.link).toBe('https://checkout.flutterwave.com/pay/xyz');
    expect(result.amount).toBe(79000);
    expect(db.flutterwave_payments).toHaveLength(1);
    expect(db.flutterwave_payments[0]).toMatchObject({
      tenant_id: TENANT_A,
      status: 'pending',
      amount: 79000,
      currency: 'XOF',
      plan: 'pro',
      billing_interval: 'monthly',
    });
    const call = vi.mocked(client.createPaymentLink).mock.calls[0][0];
    expect(call.txRef).toBe(db.flutterwave_payments[0].tx_ref);
    expect(call.amount).toBe(79000);
    expect(call.redirectUrl).toBe('https://attabl.com/sites/chez-awa/admin/subscription?fw=return');
  });

  it('le prix annuel vient de la source unique (total annuel, pas 12 fois le mensuel affiche)', async () => {
    const { service } = setup({ tenants: [tenant({ currency: 'XAF' })] });
    const result = await service.startPayment({
      tenantId: TENANT_A,
      customerEmail: 'a@b.co',
      plan: 'pro',
      interval: 'yearly',
    });
    expect(result.amount).toBe(758400);
    expect(result.currency).toBe('XAF');
  });

  it('refuse une devise hors XOF/XAF', async () => {
    const { service, db } = setup({ tenants: [tenant({ currency: 'EUR' })] });
    await expect(
      service.startPayment({
        tenantId: TENANT_A,
        customerEmail: 'a@b.co',
        plan: 'pro',
        interval: 'monthly',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(db.flutterwave_payments).toHaveLength(0);
  });

  it('refuse un restaurant qui a deja un abonnement Stripe vivant (pas de double encaissement)', async () => {
    const { service } = setup({
      tenants: [tenant({ subscription_status: 'active', stripe_subscription_id: 'sub_123' })],
    });
    await expect(
      service.startPayment({
        tenantId: TENANT_A,
        customerEmail: 'a@b.co',
        plan: 'pro',
        interval: 'monthly',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('accepte un restaurant dont l abonnement Stripe est mort (identifiant perime)', async () => {
    const { service } = setup({
      tenants: [tenant({ subscription_status: 'cancelled', stripe_subscription_id: 'sub_old' })],
    });
    await expect(
      service.startPayment({
        tenantId: TENANT_A,
        customerEmail: 'a@b.co',
        plan: 'pro',
        interval: 'monthly',
      }),
    ).resolves.toMatchObject({ amount: 79000 });
  });

  it('restaurant inconnu ou supprime: NOT_FOUND', async () => {
    const { service } = setup({ tenants: [tenant({ deleted_at: '2026-01-01T00:00:00.000Z' })] });
    await expect(
      service.startPayment({
        tenantId: TENANT_A,
        customerEmail: 'a@b.co',
        plan: 'pro',
        interval: 'monthly',
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('si Flutterwave refuse, la tentative orpheline est effacee', async () => {
    const { service, db, client } = setup({});
    vi.mocked(client.createPaymentLink).mockRejectedValue(new Error('down'));
    await expect(
      service.startPayment({
        tenantId: TENANT_A,
        customerEmail: 'a@b.co',
        plan: 'pro',
        interval: 'monthly',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(db.flutterwave_payments).toHaveLength(0);
  });
});

describe('processTransaction: rejets (temoins negatifs)', () => {
  it('une transaction non reussie ne change rien', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, status: 'failed' }),
    );
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'NOT_SUCCESSFUL',
    });
    expect(tenantRow(db).subscription_status).toBe('trial');
    expect(db.flutterwave_payments[0].status).toBe('pending');
  });

  it('un montant different est rejete (sous-paiement)', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF, amount: 100 }));
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'AMOUNT_MISMATCH',
    });
    expect(tenantRow(db).subscription_status).toBe('trial');
    expect(db.flutterwave_payments[0].status).toBe('pending');
  });

  it('un surplus est accepte (doc officielle: montant superieur ou egal), un sous-paiement d un franc est rejete', async () => {
    const over = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(over.client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, amount: 79500 }),
    );
    expect((await over.service.processTransaction(7001)).kind).toBe('applied');

    const under = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(under.client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, amount: 78999 }),
    );
    expect(await under.service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('une devise differente est rejetee (79000 XAF ne vaut pas 79000 XOF)', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: REF, currency: 'XAF' }),
    );
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'CURRENCY_MISMATCH',
    });
    expect(tenantRow(db).subscription_status).toBe('trial');
  });

  it('une reference inconnue (bien formee mais sans ligne) est rejetee', async () => {
    const { service, db, client } = setup({ payments: [] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'UNKNOWN_TX_REF',
    });
    expect(tenantRow(db).subscription_status).toBe('trial');
  });

  it('une reference etrangere (autre produit) est rejetee', async () => {
    const { service, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: 'commande-boutique-9' }),
    );
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'UNKNOWN_TX_REF',
    });
  });

  it('un autre restaurant que celui de la session est rejete', async () => {
    const { service, db, client } = setup({
      tenants: [tenant(), tenant({ id: TENANT_B, slug: 'autre' })],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    expect(await service.processTransaction(7001, TENANT_B)).toEqual({
      kind: 'rejected',
      reason: 'WRONG_TENANT',
    });
    expect(tenantRow(db, TENANT_A).subscription_status).toBe('trial');
    expect(tenantRow(db, TENANT_B).subscription_status).toBe('trial');
    expect(db.flutterwave_payments[0].status).toBe('pending');
  });

  it('une reference qui nomme un restaurant mais dont la ligne en nomme un autre est rejetee', async () => {
    const refB = buildTxRef(TENANT_B, 'pro', 'monthly', 'bbbbbbbbbbbbbbbb');
    const { service, client } = setup({
      payments: [pendingPayment(refB, { tenant_id: TENANT_A })],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: refB }));
    expect(await service.processTransaction(7001)).toEqual({
      kind: 'rejected',
      reason: 'UNKNOWN_TX_REF',
    });
  });
});

describe('processTransaction: application', () => {
  it('active l abonnement, pose plan et periode, rend is_active (temoin positif)', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));

    const outcome = await service.processTransaction(7001, TENANT_A);

    expect(outcome).toMatchObject({ kind: 'applied', tenantId: TENANT_A, plan: 'pro' });
    const row = tenantRow(db);
    expect(row).toMatchObject({
      subscription_status: 'active',
      subscription_plan: 'pro',
      billing_interval: 'monthly',
      is_active: true,
      freeze_reason: null,
      subscription_current_period_start: '2026-11-15T10:00:00.000Z',
      subscription_current_period_end: '2026-12-15T10:00:00.000Z',
    });
    expect(db.flutterwave_payments[0]).toMatchObject({
      status: 'successful',
      flw_transaction_id: 7001,
      period_end: '2026-12-15T10:00:00.000Z',
    });
  });

  it('prolonge depuis la fin de periode en cours, pas depuis maintenant', async () => {
    const { service, db, client } = setup({
      tenants: [
        tenant({
          subscription_status: 'active',
          subscription_plan: 'pro',
          subscription_current_period_end: '2026-11-20T00:00:00.000Z',
        }),
      ],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await service.processTransaction(7001);
    expect(tenantRow(db).subscription_current_period_end).toBe('2026-12-20T00:00:00.000Z');
  });

  it('periode expiree: repart de maintenant', async () => {
    const { service, db, client } = setup({
      tenants: [
        tenant({
          subscription_status: 'active',
          subscription_current_period_end: '2026-10-01T00:00:00.000Z',
        }),
      ],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await service.processTransaction(7001);
    expect(tenantRow(db).subscription_current_period_end).toBe('2026-12-15T10:00:00.000Z');
  });

  it('annuel: douze mois', async () => {
    const refY = buildTxRef(TENANT_A, 'pro', 'yearly', 'cccccccccccccccc');
    const { service, db, client } = setup({
      payments: [pendingPayment(refY, { billing_interval: 'yearly', amount: 758400 })],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(
      verified({ tx_ref: refY, amount: 758400 }),
    );
    await service.processTransaction(7002);
    expect(tenantRow(db)).toMatchObject({
      billing_interval: 'yearly',
      subscription_current_period_end: '2027-11-15T10:00:00.000Z',
    });
  });

  it('un essai en cours garde ses jours restants', async () => {
    const { service, db, client } = setup({
      tenants: [tenant({ trial_ends_at: '2026-11-25T10:00:00.000Z' })],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await service.processTransaction(7001);
    expect(tenantRow(db).subscription_current_period_end).toBe('2026-12-25T10:00:00.000Z');
  });

  it('leve un gel d essai expire et un gel d impaye', async () => {
    for (const reason of ['trial_expired', 'past_due_overdue', 'flutterwave_unpaid']) {
      const { service, db, client } = setup({
        tenants: [
          tenant({ subscription_status: 'frozen', is_active: false, freeze_reason: reason }),
        ],
        payments: [pendingPayment(REF)],
      });
      vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
      const outcome = await service.processTransaction(7001);
      expect(outcome).toMatchObject({ kind: 'applied', unfrozen: true });
      expect(tenantRow(db)).toMatchObject({
        subscription_status: 'active',
        is_active: true,
        freeze_reason: null,
      });
    }
  });

  it('NE leve PAS un gel pour litige: la periode est notee, le gel reste (temoin negatif)', async () => {
    const { service, db, client } = setup({
      tenants: [
        tenant({ subscription_status: 'frozen', is_active: false, freeze_reason: 'dispute' }),
      ],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    const outcome = await service.processTransaction(7001);
    expect(outcome).toMatchObject({ kind: 'applied', unfrozen: false });
    expect(tenantRow(db)).toMatchObject({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'dispute',
      subscription_current_period_end: '2026-12-15T10:00:00.000Z',
    });
  });

  it('un restaurant suspendu par le super-admin reste inactif', async () => {
    const { service, db, client } = setup({
      tenants: [tenant({ suspended_at: '2026-11-01T00:00:00.000Z', is_active: false })],
      payments: [pendingPayment(REF)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await service.processTransaction(7001);
    expect(tenantRow(db)).toMatchObject({ subscription_status: 'active', is_active: false });
  });
});

describe('processTransaction: idempotence', () => {
  it('un webhook rejoue ne prolonge pas une seconde fois', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));

    expect((await service.processTransaction(7001)).kind).toBe('applied');
    const afterFirst = tenantRow(db).subscription_current_period_end;
    expect(await service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
    expect(tenantRow(db).subscription_current_period_end).toBe(afterFirst);
  });

  it('deux webhooks simultanes ne prolongent qu une fois', async () => {
    const { service, db, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));

    const outcomes = await Promise.all([
      service.processTransaction(7001),
      service.processTransaction(7001),
    ]);
    expect(outcomes.filter((o) => o.kind === 'applied')).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === 'duplicate')).toHaveLength(1);
    expect(tenantRow(db).subscription_current_period_end).toBe('2026-12-15T10:00:00.000Z');
  });

  it('une meme transaction Flutterwave ne regle pas deux lignes', async () => {
    const ref2 = buildTxRef(TENANT_A, 'pro', 'monthly', 'dddddddddddddddd');
    const { service, db, client } = setup({
      payments: [pendingPayment(REF), pendingPayment(ref2)],
    });
    vi.mocked(client.verifyTransaction).mockResolvedValueOnce(verified({ tx_ref: REF }));
    await service.processTransaction(7001);
    const endAfterFirst = tenantRow(db).subscription_current_period_end;
    vi.mocked(client.verifyTransaction).mockResolvedValueOnce(verified({ tx_ref: ref2 }));
    expect(await service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
    expect(tenantRow(db).subscription_current_period_end).toBe(endAfterFirst);
    expect(db.flutterwave_payments.find((p) => p.tx_ref === ref2)?.status).toBe('pending');
  });

  it('si la mise a jour de l abonnement echoue, la ligne redevient pending (le webhook rejoue)', async () => {
    const { service, db, client } = setup({
      payments: [pendingPayment(REF)],
      failTenantUpdate: true,
    });
    vi.mocked(client.verifyTransaction).mockResolvedValue(verified({ tx_ref: REF }));
    await expect(service.processTransaction(7001)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(db.flutterwave_payments[0]).toMatchObject({
      status: 'pending',
      flw_transaction_id: null,
      period_start: null,
    });
    expect(tenantRow(db).subscription_status).toBe('trial');
  });

  it('une panne de l API de verification remonte (500 cote webhook, Flutterwave relancera)', async () => {
    const { service, client } = setup({ payments: [pendingPayment(REF)] });
    vi.mocked(client.verifyTransaction).mockRejectedValue(new Error('down'));
    await expect(service.processTransaction(7001)).rejects.toThrow('down');
  });
});
