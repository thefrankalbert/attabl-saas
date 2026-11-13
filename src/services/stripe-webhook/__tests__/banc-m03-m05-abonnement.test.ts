import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/stripe/server', () => ({
  getPlanFromPriceId: (id: string) =>
    id === 'price_business' ? 'business' : id === 'price_starter' ? 'starter' : null,
  getIntervalFromPriceId: () => null,
}));

import { handleInvoicePaymentFailed } from '../invoice';
import { handleSubscriptionUpdated } from '../subscription';
import { doublureBase, doublureStripe, introuvable } from './banc-doublures';

/**
 * Lot Stripe du 13 novembre 2026, M-03 facture d'un changement de formule
 * refuse, et M-05 evenements d'abonnement livres dans le desordre.
 *
 * Chaque garde est mesuree dans les deux sens: le cas a refuser ET le cas
 * legitime qui doit continuer de passer.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// M-03 - la facture d'un changement de formule refuse n'est pas un impaye
// ---------------------------------------------------------------------------

describe('M-03 - invoice.payment_failed (relecture B1)', () => {
  const tenant = {
    id: 'tenant-1',
    subscription_status: 'active',
    stripe_subscription_id: 'sub_courant',
    suspended_at: null,
    deleted_at: null,
  };
  const facture = (billingReason: string) =>
    ({
      id: 'in_1',
      customer: 'cus_1',
      billing_reason: billingReason,
      parent: { subscription_details: { subscription: 'sub_courant' } },
    }) as unknown as Stripe.Invoice;

  it("ne met PAS en impaye sur le refus d'une facture de changement de formule", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve, voidInvoice } = doublureStripe();
    // Stripe confirme: l'abonnement est en regle, le changement est en attente.
    retrieve.mockResolvedValue({ id: 'sub_courant', status: 'active', pending_update: {} });

    await handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_update'));

    expect(retrieve).toHaveBeenCalledWith('sub_courant');
    expect(ecritures).toEqual([]);
    // Filet: la facture restee ouverte est annulee.
    expect(voidInvoice).toHaveBeenCalledWith('in_1');
  });

  it("n'annule rien quand aucun changement n'est en attente", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve, voidInvoice } = doublureStripe();
    retrieve.mockResolvedValue({ id: 'sub_courant', status: 'active', pending_update: null });

    await handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_update'));

    expect(ecritures).toEqual([]);
    expect(voidInvoice).not.toHaveBeenCalled();
  });

  it('met en impaye quand le changement a ete applique hors de notre route et reste impaye', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    // Portail ou tableau de bord: la formule est appliquee, l'abonnement est
    // en impaye chez Stripe. C'est un vrai impaye.
    retrieve.mockResolvedValue({ id: 'sub_courant', status: 'past_due', pending_update: null });

    await handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_update'));

    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });

  it("traite l'echec comme un impaye ordinaire, sans rejeu, quand l'abonnement est introuvable", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(introuvable);

    await expect(
      handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_update')),
    ).resolves.toBeUndefined();
    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });

  it("laisse Stripe rejouer quand l'abonnement est illisible", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(new Error('timeout'));

    await expect(
      handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_update')),
    ).rejects.toThrow();
    expect(ecritures).toEqual([]);
  });

  it("met en impaye sur le refus d'une facture de renouvellement (temoin)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe } = doublureStripe();

    await handleInvoicePaymentFailed({ supabase, stripe }, facture('subscription_cycle'));

    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M-05 - evenements livres dans le desordre
// ---------------------------------------------------------------------------

describe('M-05 - customer.subscription.updated perime', () => {
  const tenant = {
    id: 'tenant-1',
    subscription_status: 'active',
    subscription_plan: 'starter',
    billing_interval: 'monthly',
    stripe_subscription_id: 'sub_courant',
    suspended_at: null,
    deleted_at: null,
    freeze_reason: null,
  };
  const abonnement = (status: string, prix = 'price_starter') =>
    ({
      id: 'sub_courant',
      customer: 'cus_1',
      status,
      items: { data: [{ price: { id: prix } }] },
    }) as unknown as Stripe.Subscription;

  it("n'applique PAS un impaye perime quand Stripe dit que l'abonnement est actif", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue(abonnement('active'));

    await handleSubscriptionUpdated({ supabase, stripe }, abonnement('past_due'));

    expect(retrieve).toHaveBeenCalledWith('sub_courant');
    expect(ecritures.every((e) => e.subscription_status !== 'past_due')).toBe(true);
  });

  it("applique l'impaye quand Stripe le confirme (temoin)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue(abonnement('past_due'));

    await handleSubscriptionUpdated({ supabase, stripe }, abonnement('past_due'));

    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });

  it("n'ecrit PAS l'ancienne formule d'un evenement perime (relecture M6)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    // L'evenement date d'avant le changement paye; Stripe dit Business.
    retrieve.mockResolvedValue(abonnement('active', 'price_business'));

    await handleSubscriptionUpdated({ supabase, stripe }, abonnement('active', 'price_starter'));

    expect(ecritures.some((e) => e.subscription_plan === 'business')).toBe(true);
    expect(ecritures.every((e) => e.subscription_plan !== 'starter')).toBe(true);
  });

  it("n'applique PAS l'evenement et laisse Stripe rejouer quand l'etat reel est illisible", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(new Error('timeout'));

    await expect(
      handleSubscriptionUpdated({ supabase, stripe }, abonnement('past_due')),
    ).rejects.toThrow();
    expect(ecritures).toEqual([]);
  });

  it("applique l'evenement quand l'abonnement est introuvable (permanent, pas de rejeu)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(introuvable);

    await handleSubscriptionUpdated({ supabase, stripe }, abonnement('past_due'));

    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });

  it('ignore une relecture qui ne rend pas CET abonnement', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue({ id: 'sub_autre', status: 'active' });

    await handleSubscriptionUpdated({ supabase, stripe }, abonnement('past_due'));

    expect(ecritures.some((e) => e.subscription_status === 'past_due')).toBe(true);
  });
});
