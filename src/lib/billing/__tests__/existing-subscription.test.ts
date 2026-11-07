import { describe, it, expect, vi } from 'vitest';

import { classifyExistingSubscription } from '../existing-subscription';

/**
 * Pourquoi ces tests. `tenants.stripe_subscription_id` n'est jamais remis a
 * null quand un abonnement meurt, et les deux routes se renvoyaient la balle:
 * la caisse repondait 409 "utilisez le changement de plan", le changement de
 * plan repondait 400 "creez un abonnement via le checkout". Un client resilie
 * n'avait aucun chemin pour revenir payer.
 *
 * Deux proprietes a figer, et la seconde est la plus importante:
 *   1. un abonnement MORT n'empeche plus d'ouvrir la caisse;
 *   2. un abonnement VIVANT l'empeche toujours - sinon on cree un second
 *      abonnement Stripe et le client est facture DEUX FOIS.
 */

const jamaisAppele = vi.fn(async () => {
  throw new Error('Stripe ne devait pas etre appele');
});

describe('classifyExistingSubscription', () => {
  it('aucun identifiant: la caisse peut s ouvrir, sans appeler Stripe', async () => {
    const retrieveStripeStatus = vi.fn();
    const verdict = await classifyExistingSubscription({
      subscriptionId: null,
      status: null,
      retrieveStripeStatus,
    });

    expect(verdict).toEqual({ kind: 'none' });
    expect(retrieveStripeStatus).not.toHaveBeenCalled();
  });

  // Cas courant: pas d'appel reseau pour le trancher.
  it.each(['trial', 'active', 'past_due'])(
    'statut local %s: refuse sans appeler Stripe',
    async (status) => {
      const verdict = await classifyExistingSubscription({
        subscriptionId: 'sub_1',
        status,
        retrieveStripeStatus: jamaisAppele,
      });

      expect(verdict).toEqual({ kind: 'live', reason: 'local-status' });
    },
  );

  it.each(['canceled', 'incomplete_expired'])(
    'statut local resilie + Stripe dit %s: identifiant a effacer, caisse ouverte',
    async (stripeStatus) => {
      const verdict = await classifyExistingSubscription({
        subscriptionId: 'sub_1',
        status: 'cancelled',
        retrieveStripeStatus: vi.fn(async () => stripeStatus),
      });

      expect(verdict).toEqual({ kind: 'stale', subscriptionId: 'sub_1', stripeStatus });
    },
  );

  it('Stripe ne connait plus l abonnement (404): identifiant a effacer', async () => {
    const verdict = await classifyExistingSubscription({
      subscriptionId: 'sub_disparu',
      status: 'cancelled',
      retrieveStripeStatus: vi.fn(async () => null),
    });

    expect(verdict).toEqual({
      kind: 'stale',
      subscriptionId: 'sub_disparu',
      stripeStatus: null,
    });
  });

  /**
   * LE TEST QUI PROTEGE LE CLIENT. `unpaid` et `paused` ne sont pas des
   * statuts utilisables chez nous, mais l'abonnement VIT chez Stripe. Ouvrir
   * la caisse la-dessus creerait un second abonnement: double facturation.
   */
  it.each(['unpaid', 'paused', 'active', 'trialing', 'past_due', 'incomplete'])(
    'statut local resilie mais Stripe dit %s: on refuse, pas de double facturation',
    async (stripeStatus) => {
      const verdict = await classifyExistingSubscription({
        subscriptionId: 'sub_1',
        status: 'cancelled',
        retrieveStripeStatus: vi.fn(async () => stripeStatus),
      });

      expect(verdict).toEqual({ kind: 'live', reason: 'stripe-status', stripeStatus });
    },
  );

  it('une panne Stripe remonte: l appelant refuse, il ne devine pas', async () => {
    // Si on avalait l'erreur en la lisant comme "mort", une panne Stripe
    // suffirait a creer un second abonnement.
    await expect(
      classifyExistingSubscription({
        subscriptionId: 'sub_1',
        status: 'cancelled',
        retrieveStripeStatus: vi.fn(async () => {
          throw new Error('Stripe indisponible');
        }),
      }),
    ).rejects.toThrow('Stripe indisponible');
  });

  it('statut local absent et Stripe dit resilie: caisse ouverte', async () => {
    const verdict = await classifyExistingSubscription({
      subscriptionId: 'sub_1',
      status: null,
      retrieveStripeStatus: vi.fn(async () => 'canceled'),
    });

    expect(verdict).toMatchObject({ kind: 'stale' });
  });
});
