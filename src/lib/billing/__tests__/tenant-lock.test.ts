import { describe, it, expect } from 'vitest';

import {
  TENANT_LOCK_COLUMNS,
  isLockedOnlyByLapsedTrial,
  isTenantServing,
  isTrialLapsed,
  kitchenMayFinishOrder,
  tenantLockReason,
  type TenantLockRow,
} from '../tenant-lock';

/**
 * La regle de coupure d'un restaurant etait ecrite quatre fois dans le depot,
 * et deux de ces copies ne disaient pas la meme chose. Surtout, la caisse
 * (`/api/orders/pos`) n'en portait AUCUNE: un restaurant gele, suspendu ou
 * desactive continuait d'encaisser.
 *
 * Ces tests figent la regle elle-meme. Les tests de route verifient qu'elle est
 * bien appelee, et au bon endroit.
 */

const servant: TenantLockRow = {
  is_active: true,
  suspended_at: null,
  subscription_status: 'active',
};

describe('tenantLockReason', () => {
  it('laisse servir un restaurant actif et a jour', () => {
    expect(tenantLockReason(servant)).toBeNull();
    expect(isTenantServing(servant)).toBe(true);
  });

  it('coupe un restaurant desactive', () => {
    expect(tenantLockReason({ ...servant, is_active: false })).toBe('inactive');
  });

  it('coupe un restaurant suspendu par le super-admin, meme is_active a true', () => {
    // CTR7-1: `suspended_at` etait ecrit et affiche dans la console plateforme,
    // mais applique nulle part - et le webhook Stripe reecrit `is_active` a
    // chaque evenement d'abonnement. Les deux verrous sont independants.
    expect(tenantLockReason({ ...servant, suspended_at: '2026-11-01T00:00:00Z' })).toBe(
      'suspended',
    );
  });

  it('coupe un restaurant gele, meme is_active a true', () => {
    // C'est l'etat que `unsuspendTenant` produisait avant la contrainte du
    // 2026-11-05: une ligne peut porter is_active=true ET frozen.
    expect(tenantLockReason({ ...servant, subscription_status: 'frozen' })).toBe('subscription');
  });

  it.each(['cancelled', 'pending', 'paused', 'unpaid', 'incomplete', null])(
    'coupe un restaurant au statut %s',
    (status) => {
      expect(tenantLockReason({ ...servant, subscription_status: status })).toBe('subscription');
    },
  );

  it('laisse servir un restaurant en essai ou en retard de paiement', () => {
    // `past_due` reste servant: la relance Stripe est en cours et le cron de gel
    // le borne dans le temps. Couper ici couperait un client qui va payer.
    expect(tenantLockReason({ ...servant, subscription_status: 'trial' })).toBeNull();
    expect(tenantLockReason({ ...servant, subscription_status: 'past_due' })).toBeNull();
  });

  it('priorise la cause la plus specifique quand plusieurs verrous sont poses', () => {
    // L'ordre fixe le code HTTP renvoye: is_active -> 400, les deux autres -> 403.
    expect(
      tenantLockReason({
        is_active: false,
        suspended_at: '2026-11-01T00:00:00Z',
        subscription_status: 'frozen',
      }),
    ).toBe('inactive');
  });

  it('traite une colonne absente comme une coupure, jamais comme un feu vert', () => {
    // Un `.select()` qui oublie une colonne doit refuser, pas ouvrir.
    expect(tenantLockReason({})).toBe('inactive');
    expect(tenantLockReason({ is_active: true, suspended_at: null })).toBe('subscription');
  });

  it('expose les colonnes que tout appelant doit selectionner', () => {
    for (const column of [
      'is_active',
      'suspended_at',
      'subscription_status',
      'trial_ends_at',
      'stripe_subscription_id',
    ]) {
      expect(TENANT_LOCK_COLUMNS).toContain(column);
    }
  });
});

/**
 * L'essai expire. Le cron `freeze-expired-trials` ne passe qu'a 02:00: entre
 * `trial_ends_at` et son passage, une commande convive etait acceptee et
 * l'admin ne voyait rien. La regle est maintenant celle du cron, jugee a
 * l'instant: statut `trial` + `trial_ends_at` passe + aucun abonnement Stripe.
 */
describe("tenantLockReason - fin d'essai", () => {
  const MAINTENANT = Date.parse('2026-11-09T12:00:00Z');
  const essai: TenantLockRow = {
    ...servant,
    subscription_status: 'trial',
    stripe_subscription_id: null,
  };

  it('coupe un essai expire sans attendre le gel du cron', () => {
    const expire = { ...essai, trial_ends_at: '2026-11-09T11:59:00Z' };
    expect(tenantLockReason(expire, MAINTENANT)).toBe('subscription');
    expect(isTenantServing(expire, MAINTENANT)).toBe(false);
  });

  it('laisse servir un essai qui court encore', () => {
    const enCours = { ...essai, trial_ends_at: '2026-11-09T12:01:00Z' };
    expect(tenantLockReason(enCours, MAINTENANT)).toBeNull();
  });

  it('laisse servir un essai expire couvert par un abonnement Stripe', () => {
    // Le checkout ouvre un essai Stripe de ceil(jours restants): il finit
    // jusqu'a 24 h APRES trial_ends_at. Le cron ne touche pas ces lignes.
    const souscrit = {
      ...essai,
      trial_ends_at: '2026-11-09T11:59:00Z',
      stripe_subscription_id: 'sub_123',
    };
    expect(tenantLockReason(souscrit, MAINTENANT)).toBeNull();
  });

  it("n'applique la regle qu'au statut trial", () => {
    // Un abonne actif garde un vieux trial_ends_at d'inscription.
    const actif = {
      ...servant,
      trial_ends_at: '2020-01-01T00:00:00Z',
      stripe_subscription_id: null,
    };
    expect(tenantLockReason(actif, MAINTENANT)).toBeNull();
  });

  it('laisse servir un essai sans date de fin (le cron ne le gele pas non plus)', () => {
    expect(tenantLockReason({ ...essai, trial_ends_at: null }, MAINTENANT)).toBeNull();
  });

  it("traite une colonne d'abonnement absente comme une absence d'abonnement", () => {
    // Un `.select()` qui oublie stripe_subscription_id doit refuser, pas ouvrir.
    const sansColonne: TenantLockRow = {
      ...servant,
      subscription_status: 'trial',
      trial_ends_at: '2026-11-09T11:59:00Z',
    };
    expect(isTrialLapsed(sansColonne, MAINTENANT)).toBe(true);
  });
});

/**
 * Decision produit du 2026-11-09: a la fin d'un essai sans abonnement, la
 * cuisine finit les commandes passees AVANT `trial_ends_at`. Uniquement quand le
 * verrou vient de la fin d'essai: aucune autre coupure n'ouvre quoi que ce soit.
 */
describe('kitchenMayFinishOrder', () => {
  const MAINTENANT = Date.parse('2026-11-09T12:00:00Z');
  const FIN = '2026-11-09T10:00:00Z';
  const AVANT = '2026-11-09T09:59:59Z';
  const APRES = '2026-11-09T10:00:01Z';
  const expire: TenantLockRow = {
    ...servant,
    subscription_status: 'trial',
    trial_ends_at: FIN,
    stripe_subscription_id: null,
  };

  it('autorise une commande creee avant la fin de l essai', () => {
    expect(isLockedOnlyByLapsedTrial(expire, MAINTENANT)).toBe(true);
    expect(kitchenMayFinishOrder(expire, AVANT, MAINTENANT)).toBe(true);
  });

  it('refuse une commande creee a la fin de l essai ou apres', () => {
    expect(kitchenMayFinishOrder(expire, FIN, MAINTENANT)).toBe(false);
    expect(kitchenMayFinishOrder(expire, APRES, MAINTENANT)).toBe(false);
  });

  it('refuse une date de commande illisible', () => {
    expect(kitchenMayFinishOrder(expire, 'pas une date', MAINTENANT)).toBe(false);
  });

  it.each([
    ['suspendu par le super-admin', { suspended_at: '2026-11-09T11:00:00Z' }],
    ['desactive', { is_active: false }],
    ['gele par le cron', { subscription_status: 'frozen', is_active: false }],
    ['gele, is_active encore a true', { subscription_status: 'frozen' }],
    ['resilie', { subscription_status: 'cancelled' }],
  ])("n'ouvre rien quand le restaurant est %s", (_cas, etat) => {
    const row = { ...expire, ...etat };
    expect(isLockedOnlyByLapsedTrial(row, MAINTENANT)).toBe(false);
    expect(kitchenMayFinishOrder(row, AVANT, MAINTENANT)).toBe(false);
  });

  it("n'a rien a ouvrir pour un restaurant qui sert", () => {
    const enCours = { ...expire, trial_ends_at: '2026-11-09T13:00:00Z' };
    expect(isLockedOnlyByLapsedTrial(servant, MAINTENANT)).toBe(false);
    expect(isLockedOnlyByLapsedTrial(enCours, MAINTENANT)).toBe(false);
  });

  it('ne rouvre pas un essai couvert par un abonnement Stripe (il sert deja)', () => {
    const souscrit = { ...expire, stripe_subscription_id: 'sub_1' };
    expect(isLockedOnlyByLapsedTrial(souscrit, MAINTENANT)).toBe(false);
  });
});
