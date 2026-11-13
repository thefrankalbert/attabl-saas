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

import { logger } from '@/lib/logger';
import { handleCheckoutSessionCompleted } from '../checkout';
import { doublureBase, doublureStripe, introuvable } from './banc-doublures';

/**
 * Lot Stripe du 13 novembre 2026, M-01 double paiement: le filet de
 * `checkout.session.completed` sur un restaurant deja abonne.
 *
 * Chaque garde est mesuree dans les deux sens: le cas a refuser ET le cas
 * legitime qui doit continuer de passer.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// M-01 - filet au paiement: second abonnement sur un restaurant deja abonne
// ---------------------------------------------------------------------------

describe('M-01 - checkout.session.completed sur un restaurant deja abonne', () => {
  const session = {
    id: 'cs_2',
    metadata: { tenant_id: 'tenant-1', plan: 'pro', billing_interval: 'monthly' },
    customer: 'cus_1',
    subscription: 'sub_nouveau',
    customer_details: { email: 'a@b.co' },
  } as unknown as Stripe.Checkout.Session;

  const tenantAbonne = {
    stripe_subscription_id: 'sub_courant',
    subscription_status: 'active',
    suspended_at: null,
    deleted_at: null,
    freeze_reason: null,
  };

  /** Stripe rend le statut de l'abonnement DEMANDE, pas un statut unique. */
  const statuts = (parId: Record<string, string>) => (id: string) =>
    Promise.resolve({ id, status: parId[id] });

  it("n'ecrase PAS un abonnement en regle, annule le doublon et alerte", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).toHaveBeenCalledTimes(1);
    // Le doublon est annule SANS marque: sa suppression n'a rien a proteger.
    expect(cancel.mock.calls[0]).toEqual(['sub_nouveau', undefined]);
    expect(ecritures).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('DOUBLE ABONNEMENT'),
      undefined,
      expect.objectContaining({ abonnementCourant: 'sub_courant', doublon: 'sub_nouveau' }),
    );
  });

  it('applique le filet meme quand le statut interne est en impaye (relecture m1)', async () => {
    const { supabase, ecritures } = doublureBase({
      ...tenantAbonne,
      subscription_status: 'past_due',
    });
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel.mock.calls[0][0]).toBe('sub_nouveau');
    expect(ecritures).toEqual([]);
  });

  it("garde le NOUVEAU et annule l'ancien quand l'ancien est en impaye chez Stripe", async () => {
    const { supabase, ecritures, filtresEcriture } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'past_due', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).toHaveBeenCalledTimes(1);
    // Annulation MARQUEE: la suppression qui suit ne doit pas geler.
    expect(cancel.mock.calls[0]).toEqual([
      'sub_courant',
      { cancellation_details: { comment: 'remplace_par:sub_nouveau' } },
    ]);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({ stripe_subscription_id: 'sub_nouveau' });
    // Ecriture conditionnelle: seulement si l'ancien est toujours celui lu.
    expect(filtresEcriture).toContainEqual(['eq', 'stripe_subscription_id', 'sub_courant']);
  });

  it("annule l'ESSAI et garde le nouveau quand le nouveau est deja preleve", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'trialing', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toBe('sub_courant');
    expect(ecritures[0]).toMatchObject({ stripe_subscription_id: 'sub_nouveau' });
  });

  it('garde le premier essai quand les deux abonnements sont en essai', async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'trialing', sub_nouveau: 'trialing' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toBe('sub_nouveau');
    expect(ecritures).toEqual([]);
  });

  it('annule aussi un ancien abonnement en pause', async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'paused', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel.mock.calls[0][0]).toBe('sub_courant');
    expect(ecritures[0]).toMatchObject({ stripe_subscription_id: 'sub_nouveau' });
  });

  it('ferme les autres sessions ouvertes meme quand le paiement est un doublon', async () => {
    const { supabase } = doublureBase(tenantAbonne);
    const { stripe, retrieve, list, expire } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));
    list.mockImplementation((params: { customer?: string }) =>
      Promise.resolve({
        data: params.customer ? [{ id: 'cs_3', metadata: { tenant_id: 'tenant-1' } }] : [],
      }),
    );

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(expire).toHaveBeenCalledWith('cs_3');
  });

  it('ne remplace JAMAIS un essai par un abonnement qui ne paie pas (troisieme relecture)', async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'trialing', sub_nouveau: 'incomplete' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0]).toEqual(['sub_nouveau', undefined]);
    expect(ecritures).toEqual([]);
    // Rien n'a ete preleve: ce n'est pas un double paiement a rembourser.
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('DOUBLE ABONNEMENT'),
      undefined,
      expect.anything(),
    );
  });

  it("garde un ancien en impaye plutot qu'un nouveau qui ne paie pas", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'past_due', sub_nouveau: 'incomplete' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel.mock.calls[0][0]).toBe('sub_nouveau');
    expect(ecritures).toEqual([]);
  });

  it('alerte quand un ancien a ete annule mais que le nouveau ne peut pas etre enregistre', async () => {
    const { supabase } = doublureBase(tenantAbonne, { lignesEcrites: 0 });
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'past_due', sub_nouveau: 'active' }));

    await expect(handleCheckoutSessionCompleted({ supabase, stripe }, session)).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ancien annule mais nouveau non enregistre'),
      undefined,
      expect.objectContaining({ ancien: 'sub_courant', nouveau: 'sub_nouveau' }),
    );
  });

  it("annule TOUTES les factures restees ouvertes de l'ancien abonnement remplace", async () => {
    const { supabase } = doublureBase(tenantAbonne);
    const { stripe, retrieve, invoicesList, voidInvoice } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'unpaid', sub_nouveau: 'active' }));
    // Deux periodes impayees: deux factures ouvertes.
    invoicesList.mockResolvedValue({ data: [{ id: 'in_mars' }, { id: 'in_avril' }] });

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(invoicesList).toHaveBeenCalledWith({
      subscription: 'sub_courant',
      status: 'open',
      limit: 20,
    });
    expect(voidInvoice).toHaveBeenCalledTimes(2);
    expect(voidInvoice).toHaveBeenCalledWith('in_mars');
    expect(voidInvoice).toHaveBeenCalledWith('in_avril');
  });

  it("enregistre quand meme le nouvel abonnement si l'annulation des factures echoue", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, invoicesList, voidInvoice } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'past_due', sub_nouveau: 'active' }));
    invoicesList.mockResolvedValue({ data: [{ id: 'in_ouverte' }] });
    voidInvoice.mockRejectedValue(new Error('Stripe en panne'));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(ecritures[0]).toMatchObject({ stripe_subscription_id: 'sub_nouveau' });
  });

  it('enregistre quand meme le nouvel abonnement si la liste des factures est illisible', async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, invoicesList } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'past_due', sub_nouveau: 'active' }));
    invoicesList.mockRejectedValue(new Error('timeout'));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(ecritures[0]).toMatchObject({ stripe_subscription_id: 'sub_nouveau' });
  });

  it("ne touche a AUCUNE facture quand c'est le doublon qui est annule", async () => {
    const { supabase } = doublureBase(tenantAbonne);
    const { stripe, retrieve, invoicesList, voidInvoice } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    // Le premier paiement du doublon est a rembourser: sa facture reste intacte.
    expect(invoicesList).not.toHaveBeenCalled();
    expect(voidInvoice).not.toHaveBeenCalled();
  });

  it("remplace l'identifiant quand l'ancien abonnement est mort chez Stripe (temoin)", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'canceled', sub_nouveau: 'active' }));

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(cancel).not.toHaveBeenCalled();
    expect(ecritures[0]).toMatchObject({
      stripe_subscription_id: 'sub_nouveau',
      subscription_status: 'active',
    });
  });

  it("ne dit PAS 'doublon annule' quand l'annulation echoue: Stripe rejoue (relecture M4)", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));
    cancel.mockRejectedValue(new Error('timeout'));

    await expect(handleCheckoutSessionCompleted({ supabase, stripe }, session)).rejects.toThrow();

    expect(ecritures).toEqual([]);
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('DOUBLE ABONNEMENT'),
      undefined,
      expect.anything(),
    );
  });

  it('traite un doublon deja annule comme un succes au rejeu', async () => {
    const { supabase } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_courant: 'active', sub_nouveau: 'active' }));
    cancel.mockRejectedValue(introuvable);

    await expect(
      handleCheckoutSessionCompleted({ supabase, stripe }, session),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('DOUBLE ABONNEMENT'),
      undefined,
      expect.anything(),
    );
  });

  it("laisse Stripe rejouer quand l'abonnement courant est illisible", async () => {
    const { supabase, ecritures } = doublureBase(tenantAbonne);
    const { stripe, retrieve, cancel } = doublureStripe();
    retrieve.mockRejectedValue(new Error('timeout'));

    await expect(handleCheckoutSessionCompleted({ supabase, stripe }, session)).rejects.toThrow();
    expect(cancel).not.toHaveBeenCalled();
    expect(ecritures).toEqual([]);
  });

  it('rejoue quand un autre paiement a ete enregistre entre-temps (relecture m2)', async () => {
    const { supabase, filtresEcriture } = doublureBase(
      { ...tenantAbonne, stripe_subscription_id: null },
      { lignesEcrites: 0 },
    );
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_nouveau: 'active' }));

    await expect(handleCheckoutSessionCompleted({ supabase, stripe }, session)).rejects.toThrow();
    expect(filtresEcriture).toContainEqual(['is', 'stripe_subscription_id', null]);
  });

  it('expire les autres sessions ouvertes apres un premier paiement', async () => {
    const { supabase } = doublureBase({ ...tenantAbonne, stripe_subscription_id: null });
    const { stripe, retrieve, list, expire } = doublureStripe();
    retrieve.mockImplementation(statuts({ sub_nouveau: 'active' }));
    list.mockImplementation((params: { customer?: string }) =>
      Promise.resolve({
        data: params.customer
          ? [{ id: 'cs_2', metadata: { tenant_id: 'tenant-1' } }]
          : [{ id: 'cs_1', metadata: { tenant_id: 'tenant-1' } }],
      }),
    );

    await handleCheckoutSessionCompleted({ supabase, stripe }, session);

    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith('cs_1');
  });
});
