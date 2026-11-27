import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { createStripeWebhookService } from '../../stripe-webhook.service';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/**
 * Audit E11: `invoice.finalization_failed` et `radar.early_fraud_warning.created`
 * tombaient dans `default` ("Unhandled Stripe event type", niveau info): aucune
 * alerte. Ils alertent maintenant (logger.error -> Sentry) avec le restaurant
 * concerne, SANS rien ecrire sur son acces.
 */

function fausseBase(options: { tenant?: { id: string } | null; lectureEnErreur?: boolean } = {}) {
  const ecritures: unknown[] = [];
  const filtres: [string, unknown][] = [];
  const from = vi.fn(() => ({
    select: () => {
      const ch = {
        eq: (c: string, v: unknown) => (filtres.push([c, v]), ch),
        maybeSingle: async () =>
          options.lectureEnErreur
            ? { data: null, error: { message: 'db down' } }
            : {
                data: options.tenant === undefined ? { id: 'tenant-1' } : options.tenant,
                error: null,
              },
      };
      return ch;
    },
    update: (payload: unknown) => {
      ecritures.push(payload);
      throw new Error('aucune ecriture attendue');
    },
  }));
  return { supabase: { from } as unknown as SupabaseClient, ecritures, filtres, from };
}

function fauxStripe(retrieve: () => Promise<unknown> = async () => ({ customer: 'cus_1' })) {
  const s = { charges: { retrieve: vi.fn(retrieve) } };
  return { stripe: s as unknown as Stripe, retrieve: s.charges.retrieve };
}

function evenement(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: 'evt_1', type, data: { object } } as unknown as Stripe.Event;
}

const factureEchouee = {
  id: 'in_1',
  object: 'invoice',
  customer: 'cus_1',
  billing_reason: 'subscription_cycle',
  status: 'draft',
  parent: { subscription_details: { subscription: 'sub_1' } },
  last_finalization_error: {
    type: 'invalid_request_error',
    code: 'customer_tax_location_invalid',
    message: 'adresse du client: 12 rue Exemple',
  },
};

const alerteFraude = {
  id: 'issfr_1',
  object: 'radar.early_fraud_warning',
  actionable: true,
  charge: 'ch_1',
  payment_intent: 'pi_1',
  fraud_type: 'made_with_stolen_card',
  livemode: false,
  created: 1_700_000_000,
};

beforeEach(() => vi.clearAllMocks());

describe('invoice.finalization_failed', () => {
  it('alerte en ERREUR avec le restaurant, le code de l erreur, et n ecrit rien', async () => {
    const base = fausseBase();
    const { stripe } = fauxStripe();

    await createStripeWebhookService(base.supabase, stripe).handleEvent(
      evenement('invoice.finalization_failed', factureEchouee),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('impossible a finaliser'),
      undefined,
      expect.objectContaining({
        tenantId: 'tenant-1',
        customerId: 'cus_1',
        invoiceId: 'in_1',
        subscriptionId: 'sub_1',
        finalizationErrorCode: 'customer_tax_location_invalid',
        finalizationErrorType: 'invalid_request_error',
      }),
    );
    expect(base.filtres).toEqual([['stripe_customer_id', 'cus_1']]);
    expect(base.ecritures).toEqual([]);
    // Plus "non gere".
    expect(logger.info).not.toHaveBeenCalledWith('Unhandled Stripe event type', expect.anything());
  });

  it('le message libre de Stripe (donnees du client possibles) n est pas journalise', async () => {
    const base = fausseBase();
    await createStripeWebhookService(base.supabase, fauxStripe().stripe).handleEvent(
      evenement('invoice.finalization_failed', factureEchouee),
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('12 rue Exemple');
  });

  it('restaurant illisible: l alerte part quand meme et l evenement est consomme (pas de rejeu)', async () => {
    const base = fausseBase({ lectureEnErreur: true });
    await expect(
      createStripeWebhookService(base.supabase, fauxStripe().stripe).handleEvent(
        evenement('invoice.finalization_failed', factureEchouee),
      ),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('impossible a finaliser'),
      undefined,
      expect.objectContaining({ tenantId: null, tenantLookupFailed: true }),
    );
  });

  it('TEMOIN NEGATIF: un type voisin non gere reste "Unhandled", sans alerte', async () => {
    const base = fausseBase();
    await createStripeWebhookService(base.supabase, fauxStripe().stripe).handleEvent(
      evenement('invoice.finalized', factureEchouee),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Unhandled Stripe event type', {
      eventType: 'invoice.finalized',
    });
    expect(base.from).not.toHaveBeenCalled();
  });
});

describe('radar.early_fraud_warning.created', () => {
  it('relit le paiement pour trouver le client, alerte avec actionable, et ne gele pas', async () => {
    const base = fausseBase();
    const { stripe, retrieve } = fauxStripe();

    await createStripeWebhookService(base.supabase, stripe).handleEvent(
      evenement('radar.early_fraud_warning.created', alerteFraude),
    );

    expect(retrieve).toHaveBeenCalledWith('ch_1');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('avertissement de fraude'),
      undefined,
      expect.objectContaining({
        tenantId: 'tenant-1',
        customerId: 'cus_1',
        earlyFraudWarningId: 'issfr_1',
        chargeId: 'ch_1',
        paymentIntentId: 'pi_1',
        fraudType: 'made_with_stolen_card',
        actionable: true,
      }),
    );
    expect(base.ecritures).toEqual([]);
  });

  it('paiement deja deplie dans l evenement: aucun appel a Stripe', async () => {
    const base = fausseBase();
    const { stripe, retrieve } = fauxStripe();
    await createStripeWebhookService(base.supabase, stripe).handleEvent(
      evenement('radar.early_fraud_warning.created', {
        ...alerteFraude,
        charge: { id: 'ch_1', customer: 'cus_1' },
      }),
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ tenantId: 'tenant-1', chargeId: 'ch_1' }),
    );
  });

  it('Stripe illisible: alerte sans restaurant, evenement consomme (pas de rejeu de 3 jours)', async () => {
    const base = fausseBase();
    const { stripe } = fauxStripe(() => Promise.reject(new Error('timeout')));
    await expect(
      createStripeWebhookService(base.supabase, stripe).handleEvent(
        evenement('radar.early_fraud_warning.created', alerteFraude),
      ),
    ).resolves.toBeUndefined();
    expect(base.from).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('avertissement de fraude'),
      undefined,
      expect.objectContaining({ tenantId: null, chargeUnreadable: true, chargeId: 'ch_1' }),
    );
  });

  it('client inconnu de la base: alerte avec tenantId null', async () => {
    const base = fausseBase({ tenant: null });
    await createStripeWebhookService(base.supabase, fauxStripe().stripe).handleEvent(
      evenement('radar.early_fraud_warning.created', alerteFraude),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ tenantId: null, customerId: 'cus_1' }),
    );
  });
});
