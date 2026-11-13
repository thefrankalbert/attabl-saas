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

import { expireOtherOpenCheckouts } from '@/lib/billing/expire-open-checkouts';
import { handleSubscriptionDeleted } from '../subscription';
import { doublureBase, doublureStripe, introuvable } from './banc-doublures';

/**
 * Lot Stripe du 13 novembre 2026, M-01 double paiement: fermeture des sessions
 * ouvertes, et suppression d'un abonnement que nous avons remplace.
 *
 * Chaque garde est mesuree dans les deux sens: le cas a refuser ET le cas
 * legitime qui doit continuer de passer.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// M-01 - expiration des autres sessions ouvertes
// ---------------------------------------------------------------------------

describe('M-01 - expireOtherOpenCheckouts', () => {
  /** Stripe ne rend que les sessions qui correspondent au filtre demande. */
  function listeSelonFiltre(
    parClient: Record<string, unknown>[],
    parAdresse: Record<string, unknown>[],
  ) {
    return (params: { customer?: string; customer_details?: unknown }) =>
      Promise.resolve({ data: params.customer ? parClient : parAdresse });
  }

  it('expire la session oubliee que SEULE la recherche par adresse retrouve (relecture M1)', async () => {
    const { stripe, list, expire } = doublureStripe();
    // Apres un premier paiement: la session payee est rattachee au nouveau
    // client, la session oubliee n'a qu'une adresse.
    list.mockImplementation(
      listeSelonFiltre(
        [{ id: 'cs_payee', metadata: { tenant_id: 'tenant-1' } }],
        [
          { id: 'cs_payee', metadata: { tenant_id: 'tenant-1' } },
          { id: 'cs_oubliee', metadata: { tenant_id: 'tenant-1' } },
        ],
      ),
    );

    const n = await expireOtherOpenCheckouts(stripe, {
      tenantId: 'tenant-1',
      customerId: 'cus_1',
      email: 'a@b.co',
      exceptSessionId: 'cs_payee',
    });

    expect(n).toBe(1);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith('cs_oubliee');
    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'open', limit: 20 });
    expect(list).toHaveBeenCalledWith({
      customer_details: { email: 'a@b.co' },
      status: 'open',
      limit: 20,
    });
  });

  it("n'expire jamais la session d'un AUTRE restaurant de la meme adresse", async () => {
    const { stripe, list, expire } = doublureStripe();
    list.mockImplementation(
      listeSelonFiltre([], [{ id: 'cs_autre_resto', metadata: { tenant_id: 'tenant-2' } }]),
    );

    expect(await expireOtherOpenCheckouts(stripe, { tenantId: 'tenant-1', email: 'a@b.co' })).toBe(
      0,
    );
    expect(expire).not.toHaveBeenCalled();
  });

  it("n'expire qu'une fois une session rendue par les deux recherches", async () => {
    const { stripe, list, expire } = doublureStripe();
    const session = { id: 'cs_1', metadata: { tenant_id: 'tenant-1' } };
    list.mockImplementation(listeSelonFiltre([session], [session]));

    await expireOtherOpenCheckouts(stripe, {
      tenantId: 'tenant-1',
      customerId: 'cus_1',
      email: 'a@b.co',
    });

    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('ne propage jamais une panne de Stripe', async () => {
    const { stripe, list } = doublureStripe();
    list.mockRejectedValue(new Error('Stripe en panne'));
    await expect(
      expireOtherOpenCheckouts(stripe, { tenantId: 'tenant-1', customerId: 'cus_1' }),
    ).resolves.toBe(0);
  });

  it('ne fait aucun appel sans client ni adresse', async () => {
    const { stripe, list } = doublureStripe();
    expect(await expireOtherOpenCheckouts(stripe, { tenantId: 'tenant-1' })).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M-01 - la suppression d'un abonnement que NOUS avons remplace
// ---------------------------------------------------------------------------

describe('M-01 - customer.subscription.deleted apres un remplacement', () => {
  // La course: la suppression de l'ancien est traitee AVANT que le nouveau soit
  // enregistre. Le restaurant porte donc encore l'ancien identifiant.
  const tenant = {
    id: 'tenant-1',
    subscription_status: 'past_due',
    stripe_subscription_id: 'sub_ancien',
  };
  const suppression = (commentaire: string | null) =>
    ({
      id: 'sub_ancien',
      customer: 'cus_1',
      status: 'canceled',
      cancellation_details: { comment: commentaire },
    }) as unknown as Stripe.Subscription;

  it("ne gele PAS et n'efface PAS l'identifiant quand le remplacant est verifie chez Stripe", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue({ status: 'active', metadata: { tenant_id: 'tenant-1' } });

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_nouveau'));

    expect(retrieve).toHaveBeenCalledWith('sub_nouveau');
    expect(ecritures).toEqual([]);
  });

  it('accepte aussi un remplacant verifie qui est en essai', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue({ status: 'trialing', metadata: { tenant_id: 'tenant-1' } });

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_nouveau'));

    expect(ecritures).toEqual([]);
  });

  // La marque arrive dans le champ ou le client ecrit son commentaire quand il
  // resilie depuis le portail de facturation: il peut la taper lui-meme.
  it('gele quand le client tape la marque avec un abonnement qui n existe pas', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(introuvable);

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_invente'));

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({ subscription_status: 'frozen', is_active: false });
  });

  it("gele quand la marque designe l'abonnement d'un AUTRE restaurant", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue({ status: 'active', metadata: { tenant_id: 'tenant-2' } });

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_dautrui'));

    expect(ecritures).toHaveLength(1);
  });

  it('gele quand le remplacant designe ne paie pas', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockResolvedValue({ status: 'canceled', metadata: { tenant_id: 'tenant-1' } });

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_mort'));

    expect(ecritures).toHaveLength(1);
  });

  it('gele quand la marque ne porte pas un identifiant d abonnement', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();

    await handleSubscriptionDeleted(
      { supabase, stripe },
      suppression('remplace_par:nimporte quoi'),
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(ecritures).toHaveLength(1);
  });

  it('laisse Stripe rejouer quand le remplacant est illisible', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe, retrieve } = doublureStripe();
    retrieve.mockRejectedValue(new Error('timeout'));

    await expect(
      handleSubscriptionDeleted({ supabase, stripe }, suppression('remplace_par:sub_nouveau')),
    ).rejects.toThrow();
    expect(ecritures).toEqual([]);
  });

  it('gele sur une vraie resiliation (temoin)', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe } = doublureStripe();

    await handleSubscriptionDeleted({ supabase, stripe }, suppression(null));

    expect(ecritures).toEqual([
      expect.objectContaining({
        subscription_status: 'frozen',
        is_active: false,
        stripe_subscription_id: null,
      }),
    ]);
  });

  it("gele quand le commentaire n'est pas notre marque", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const { stripe } = doublureStripe();

    await handleSubscriptionDeleted({ supabase, stripe }, suppression('client parti'));

    expect(ecritures).toHaveLength(1);
  });
});
