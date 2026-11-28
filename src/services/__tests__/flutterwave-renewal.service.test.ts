import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  createFlutterwaveRenewalService,
  FLUTTERWAVE_GRACE_DAYS,
} from '../flutterwave-renewal.service';
import { ServiceError } from '../errors';
import { createFakeSupabase } from './helpers/fake-supabase';

// La SELECTION (qui est a relancer, qui est a geler) est faite en SQL et mesuree par
// supabase/tests/rls/flutterwave_payments.test.sql. Ici: ce que le service fait des lignes rendues.

const NOW = new Date('2026-11-15T02:00:00.000Z');
const T1 = '11111111-2222-3333-4444-555555555555';
const T2 = '22222222-2222-3333-4444-555555555555';

type Row = Record<string, unknown>;

function due(tenantId: string, overrides: Row = {}): Row {
  return {
    payment_id: `pay-${tenantId.slice(0, 2)}`,
    tenant_id: tenantId,
    plan: 'pro',
    billing_interval: 'monthly',
    period_end: '2026-11-21T00:00:00.000Z',
    reminder: 'd7',
    ...overrides,
  };
}

function setup(opts: { dues?: Row[]; owners?: Row[]; emailOk?: boolean; freezeCount?: number }) {
  const dues = opts.dues ?? [];
  const rpcCalls: { name: string; args: Row }[] = [];
  const fake = createFakeSupabase(
    {
      tenants: [
        { id: T1, name: 'Resto 11' },
        { id: T2, name: 'Resto 22' },
      ],
      flutterwave_payments: dues.map((d) => ({
        id: d.payment_id,
        tenant_id: d.tenant_id,
        reminder_d7_at: null,
        reminder_d1_at: null,
      })),
      admin_users: opts.owners ?? [
        { tenant_id: T1, postes: ['owner'], is_active: true, email: 'owner-11@exemple.test' },
        { tenant_id: T2, postes: ['owner'], is_active: true, email: 'owner-22@exemple.test' },
      ],
    },
    {
      rpc: {
        flutterwave_renewals_due: (args) => {
          rpcCalls.push({ name: 'due', args });
          return { data: dues, error: null };
        },
        flutterwave_freeze_overdue: (args) => {
          rpcCalls.push({ name: 'freeze', args });
          return { data: opts.freezeCount ?? 0, error: null };
        },
      },
    },
  );
  const billing = {
    startPayment: vi.fn().mockResolvedValue({
      link: 'https://checkout.flutterwave.com/pay/abc',
      txRef: 'r',
      amount: 79000,
      currency: 'XOF',
    }),
  };
  const email = {
    sendRenewalReminderEmail: vi.fn().mockResolvedValue({ success: opts.emailOk ?? true }),
  };
  const service = createFlutterwaveRenewalService(fake.client, { billing, email, now: () => NOW });
  return { ...fake, billing, email, service, rpcCalls };
}

const payment = (db: Record<string, Row[]>, id: string) =>
  db.flutterwave_payments.find((p) => p.id === id) as Row;

describe('rappels de renouvellement', () => {
  it('envoie le rappel avec le lien de paiement et le memorise dans la colonne de la fenetre', async () => {
    const { service, email, billing, db, rpcCalls } = setup({ dues: [due(T1)] });

    expect(await service.sendReminders()).toEqual({ reminded: 1, skipped: 0 });

    expect(rpcCalls[0]).toEqual({
      name: 'due',
      args: { p_now: NOW.toISOString(), p_limit: 200 },
    });
    expect(billing.startPayment).toHaveBeenCalledWith({
      tenantId: T1,
      customerEmail: 'owner-11@exemple.test',
      plan: 'pro',
      interval: 'monthly',
    });
    const [to, data] = email.sendRenewalReminderEmail.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(to).toBe('owner-11@exemple.test');
    expect(data).toMatchObject({
      paymentUrl: 'https://checkout.flutterwave.com/pay/abc',
      amount: 79000,
      daysLeft: 6,
      periodEndLabel: '21/11/2026',
    });
    expect(payment(db, 'pay-11').reminder_d7_at).toBe(NOW.toISOString());
    expect(payment(db, 'pay-11').reminder_d1_at).toBeNull();
  });

  it('le lien de paiement va au proprietaire seul, jamais au gerant (temoin: le gerant existe)', async () => {
    const { service, billing } = setup({
      dues: [due(T1)],
      owners: [
        { tenant_id: T1, postes: ['manager'], is_active: true, email: 'gerant@exemple.test' },
        { tenant_id: T1, postes: ['owner'], is_active: true, email: 'owner-11@exemple.test' },
      ],
    });
    await service.sendReminders();
    expect(billing.startPayment).toHaveBeenCalledWith(
      expect.objectContaining({ customerEmail: 'owner-11@exemple.test' }),
    );
  });

  it('le rappel 1 jour memorise la colonne d1, pas d7', async () => {
    const { service, db } = setup({
      dues: [due(T1, { reminder: 'd1', period_end: '2026-11-15T22:00:00.000Z' })],
    });
    await service.sendReminders();
    expect(payment(db, 'pay-11').reminder_d1_at).toBe(NOW.toISOString());
    expect(payment(db, 'pay-11').reminder_d7_at).toBeNull();
  });

  it('rien a relancer: aucun envoi, aucune ecriture', async () => {
    const { service, email, billing } = setup({ dues: [] });
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 0 });
    expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
    expect(billing.startPayment).not.toHaveBeenCalled();
  });

  it('si l envoi echoue, rien n est memorise: le prochain passage reessaie (temoin negatif)', async () => {
    const { service, db } = setup({ dues: [due(T1)], emailOk: false });
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
    expect(payment(db, 'pay-11').reminder_d7_at).toBeNull();
  });

  it('un restaurant sans proprietaire actif est ferme sans envoi (il ne doit pas revenir a chaque passage)', async () => {
    const { service, email, billing, db } = setup({ dues: [due(T1)], owners: [] });
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
    expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
    expect(billing.startPayment).not.toHaveBeenCalled();
    expect(payment(db, 'pay-11').reminder_d7_at).toBe(NOW.toISOString());
  });

  it.each(['VALIDATION', 'CONFLICT'] as const)(
    'startPayment refuse (%s): la fenetre est fermee, aucun courriel, pas de nouvel essai demain',
    async (code) => {
      const { service, billing, email, db } = setup({ dues: [due(T1)] });
      billing.startPayment.mockRejectedValueOnce(new ServiceError('refus metier', code));
      expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
      expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
      expect(payment(db, 'pay-11').reminder_d7_at).toBe(NOW.toISOString());
    },
  );

  it('une panne passagere (INTERNAL) ne ferme PAS la fenetre: le prochain passage reessaie', async () => {
    const { service, billing, db } = setup({ dues: [due(T1)] });
    billing.startPayment.mockRejectedValueOnce(
      new ServiceError('Paiement indisponible', 'INTERNAL'),
    );
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
    expect(payment(db, 'pay-11').reminder_d7_at).toBeNull();
  });

  it('un echec sur un restaurant (lien impossible) n empeche pas les suivants', async () => {
    const { service, billing, email, db } = setup({ dues: [due(T1), due(T2)] });
    billing.startPayment.mockRejectedValueOnce(new Error('flutterwave down'));
    expect(await service.sendReminders()).toEqual({ reminded: 1, skipped: 1 });
    expect(email.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
    expect(payment(db, 'pay-11').reminder_d7_at).toBeNull();
    expect(payment(db, 'pay-22').reminder_d7_at).toBe(NOW.toISOString());
  });
});

describe('gel apres le delai de grace', () => {
  it('appelle la fonction SQL avec la grace de trois jours et rend le nombre de gels', async () => {
    const { service, rpcCalls } = setup({ freezeCount: 2 });
    expect(FLUTTERWAVE_GRACE_DAYS).toBe(3);
    expect(await service.freezeOverdue()).toBe(2);
    expect(rpcCalls[0]).toEqual({
      name: 'freeze',
      args: { p_now: NOW.toISOString(), p_grace: '3 days', p_limit: 200 },
    });
  });

  it('une erreur de la base remonte (le cron repond 500 et Sentry alerte)', async () => {
    const fake = createFakeSupabase(
      {},
      { rpc: { flutterwave_freeze_overdue: () => ({ data: null, error: { message: 'boom' } }) } },
    );
    const service = createFlutterwaveRenewalService(fake.client, {
      billing: { startPayment: vi.fn() },
      email: { sendRenewalReminderEmail: vi.fn() },
      now: () => NOW,
    });
    await expect(service.freezeOverdue()).rejects.toThrow();
  });

  it('run() enchaine rappels puis gel', async () => {
    const { service } = setup({ dues: [due(T1)], freezeCount: 1 });
    expect(await service.run()).toEqual({ reminded: 1, skipped: 0, frozen: 1 });
  });
});
