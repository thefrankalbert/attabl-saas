import { describe, it, expect } from 'vitest';
import { getEffectivePlan, canAccessFeature, isSubscriptionUsable } from '../features';
import type { SubscriptionStatus } from '@/types/billing';

/**
 * Constats trouves en AUDIT du lot F3/F6, apres coup.
 *
 * Le webhook Stripe affirmait en commentaire que 'frozen' etait non entitlant,
 * "voir plans/features.ts". C'etait vrai de `isSubscriptionUsable`, et faux de
 * `getEffectivePlan`, qui ne regardait pas le statut du tout: un tenant gele
 * gardait donc toutes les fonctionnalites de son plan. Le gel ne gelait rien -
 * ni le gel d'essai expire, ni celui d'impaye, ni celui pose sur un chargeback.
 *
 * Ces tests verrouillent la propriete que les deux fonctions doivent partager:
 * un statut non utilisable ne donne acces a aucune fonctionnalite payante.
 */
describe('statuts non entitlants', () => {
  const TRIAL_PAST = '2020-01-01T00:00:00.000Z';

  it('un tenant gele retombe sur starter', () => {
    expect(getEffectivePlan('business', 'frozen', TRIAL_PAST)).toBe('starter');
    expect(canAccessFeature('canAccessInventory', 'business', 'frozen', TRIAL_PAST)).toBe(false);
  });

  it('un tenant resilie retombe sur starter', () => {
    expect(getEffectivePlan('pro', 'cancelled', null)).toBe('starter');
    expect(canAccessFeature('canAccessInventory', 'pro', 'cancelled', null)).toBe(false);
  });

  it('un impaye garde son plan: la relance Stripe est encore en cours', () => {
    expect(getEffectivePlan('pro', 'past_due', null)).toBe('pro');
    expect(canAccessFeature('canAccessInventory', 'pro', 'past_due', null)).toBe(true);
  });

  // La propriete qui manquait: les deux fonctions doivent s'accorder. Un statut
  // juge inutilisable ne doit ouvrir aucune fonctionnalite payante.
  // Balaye TOUTE l'union SubscriptionStatus: un statut ajoute plus tard sans
  // etre traite fait echouer ce test, ce qui est le but.
  it('aucun statut inutilisable n_ouvre une fonctionnalite payante', () => {
    const statuses: SubscriptionStatus[] = [
      'trial',
      'active',
      'past_due',
      'cancelled',
      'paused',
      'frozen',
    ];

    for (const status of statuses) {
      if (isSubscriptionUsable(status)) continue;
      expect(
        canAccessFeature('canAccessInventory', 'business', status, TRIAL_PAST),
        `le statut ${status} est juge inutilisable mais ouvre encore l'Inventaire`,
      ).toBe(false);
    }
  });
});
