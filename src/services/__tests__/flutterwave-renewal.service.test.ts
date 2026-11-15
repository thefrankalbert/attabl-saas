import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  createFlutterwaveRenewalService,
  FLUTTERWAVE_GRACE_DAYS,
} from '../flutterwave-renewal.service';
import { createFakeSupabase } from './helpers/fake-supabase';

const NOW = new Date('2026-11-15T02:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const T1 = '11111111-2222-3333-4444-555555555555';
const T2 = '22222222-2222-3333-4444-555555555555';

type Row = Record<string, unknown>;

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function tenant(id: string, endOffsetMs: number, overrides: Row = {}): Row {
  return {
    id,
    name: `Resto ${id.slice(0, 2)}`,
    subscription_status: 'active',
    subscription_plan: 'pro',
    billing_interval: 'monthly',
    subscription_current_period_end: iso(endOffsetMs),
    stripe_subscription_id: null,
    suspended_at: null,
    deleted_at: null,
    is_active: true,
    freeze_reason: null,
    activation_events: {},
    ...overrides,
  };
}

const paid = (tenantId: string): Row => ({ tenant_id: tenantId, status: 'successful' });
const owner = (tenantId: string): Row => ({
  tenant_id: tenantId,
  role: 'owner',
  is_active: true,
  email: `owner-${tenantId.slice(0, 2)}@exemple.test`,
});

function setup(tenants: Row[], payments: Row[], emailOk = true) {
  const fake = createFakeSupabase({
    tenants,
    flutterwave_payments: payments,
    admin_users: tenants.map((t) => owner(t.id as string)),
  });
  const billing = {
    startPayment: vi.fn().mockResolvedValue({
      link: 'https://checkout.flutterwave.com/pay/abc',
      txRef: 'r',
      amount: 79000,
      currency: 'XOF',
    }),
  };
  const email = {
    sendRenewalReminderEmail: vi.fn().mockResolvedValue({ success: emailOk }),
  };
  const service = createFlutterwaveRenewalService(fake.client, { billing, email, now: () => NOW });
  return { ...fake, billing, email, service };
}

describe('rappels de renouvellement', () => {
  it('envoie le rappel 7 jours, avec un lien de paiement frais, une seule fois', async () => {
    const { service, email, billing } = setup([tenant(T1, 6 * DAY)], [paid(T1)]);

    expect(await service.sendReminders()).toEqual({ reminded: 1, skipped: 0 });
    expect(billing.startPayment).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T1, plan: 'pro', interval: 'monthly' }),
    );
    expect(email.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
    const [to, data] = email.sendRenewalReminderEmail.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(to).toBe('owner-11@exemple.test');
    expect(data).toMatchObject({
      paymentUrl: 'https://checkout.flutterwave.com/pay/abc',
      amount: 79000,
      daysLeft: 6,
    });

    // Deuxieme passage le meme jour: rien ne repart.
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
    expect(email.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('envoie le rappel 1 jour, puis plus jamais le 7 jours pour cette echeance', async () => {
    const { service, email, db } = setup([tenant(T1, 20 * 60 * 60 * 1000)], [paid(T1)]);
    await service.sendReminders();
    expect(email.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
    expect(
      (email.sendRenewalReminderEmail.mock.calls[0] as [string, { daysLeft: number }])[1].daysLeft,
    ).toBe(1);
    const events = db.tenants[0].activation_events as Record<string, string>;
    expect(Object.keys(events).some((k) => k.startsWith('fw_renewal_d1_'))).toBe(true);

    await service.sendReminders();
    expect(email.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('une echeance a plus de 7 jours n envoie rien (temoin negatif)', async () => {
    const { service, email } = setup([tenant(T1, 10 * DAY)], [paid(T1)]);
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 0 });
    expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('un restaurant qui n a jamais paye par Flutterwave n est pas relance', async () => {
    const { service, email } = setup([tenant(T1, 3 * DAY)], []);
    await service.sendReminders();
    expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('un abonne Stripe n est pas relance', async () => {
    const { service, email } = setup(
      [tenant(T1, 3 * DAY, { stripe_subscription_id: 'sub_1' })],
      [paid(T1)],
    );
    await service.sendReminders();
    expect(email.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('si l envoi echoue, rien n est memorise: le prochain passage reessaie', async () => {
    const { service, db } = setup([tenant(T1, 3 * DAY)], [paid(T1)], false);
    expect(await service.sendReminders()).toEqual({ reminded: 0, skipped: 1 });
    expect(db.tenants[0].activation_events).toEqual({});
  });
});

describe('gel apres le delai de grace', () => {
  it('gele un abonnement Flutterwave echu depuis plus que la grace', async () => {
    const { service, db } = setup([tenant(T1, -(FLUTTERWAVE_GRACE_DAYS + 1) * DAY)], [paid(T1)]);
    expect(await service.freezeOverdue()).toBe(1);
    expect(db.tenants[0]).toMatchObject({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'flutterwave_unpaid',
    });
  });

  it('ne gele PAS pendant la grace (temoin negatif)', async () => {
    const { service, db } = setup([tenant(T1, -1 * DAY)], [paid(T1)]);
    expect(await service.freezeOverdue()).toBe(0);
    expect(db.tenants[0].subscription_status).toBe('active');
  });

  it('ne gele PAS un restaurant qui n a jamais paye par Flutterwave', async () => {
    const { service, db } = setup([tenant(T1, -10 * DAY)], []);
    expect(await service.freezeOverdue()).toBe(0);
    expect(db.tenants[0].subscription_status).toBe('active');
  });

  it('ne gele PAS un abonne Stripe, et ne touche qu au bon restaurant', async () => {
    const { service, db } = setup(
      [tenant(T1, -10 * DAY, { stripe_subscription_id: 'sub_1' }), tenant(T2, -10 * DAY)],
      [paid(T1), paid(T2)],
    );
    expect(await service.freezeOverdue()).toBe(1);
    expect(db.tenants.find((t) => t.id === T1)?.subscription_status).toBe('active');
    expect(db.tenants.find((t) => t.id === T2)?.subscription_status).toBe('frozen');
  });

  it('run() enchaine rappels puis gel', async () => {
    const { service } = setup([tenant(T1, 3 * DAY), tenant(T2, -10 * DAY)], [paid(T1), paid(T2)]);
    expect(await service.run()).toEqual({ reminded: 1, skipped: 0, frozen: 1 });
  });
});
