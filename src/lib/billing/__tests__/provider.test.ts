/**
 * Ce test fige un FAIT DU MARCHE, pas un detail d'implementation.
 *
 * Le mobile money n'a pas de prelevement automatique: le client approuve chaque
 * paiement sur son telephone, et il n'existe sur Orange Money ni Moov de mandat
 * pre-autorise equivalent a une carte enregistree (verifie le 2026-11-05).
 *
 * Tant que `autoRenew` vaut true, ATTABL peut laisser son prestataire porter
 * l'horloge de periode. Le jour ou un prestataire sans renouvellement devient
 * actif, c'est l'application qui doit la porter - demande de paiement a chaque
 * echeance, gel si la periode n'est pas reglee. Si quelqu'un passait `autoRenew`
 * a true sur un prestataire mobile money "parce que ca simplifie", les
 * abonnements cesseraient d'etre encaisses en silence: aucune erreur, aucun
 * webhook, juste des periodes qui s'enchainent sans paiement.
 */
import { describe, it, expect } from 'vitest';

import { billingCapabilities, ACTIVE_BILLING_PROVIDER } from '../provider';

describe('capacites du prestataire d encaissement', () => {
  it('Stripe sait se faire payer seul et heberge une page de gestion', () => {
    expect(billingCapabilities('stripe')).toEqual({
      autoRenew: true,
      hostedPortal: true,
      providerInvoices: true,
    });
  });

  it('l encaissement manuel ne renouvelle rien tout seul', () => {
    // C'est la contrainte du mobile money, et des premiers clients encaisses a
    // la main: aucune de ces trois capacites n'existe.
    expect(billingCapabilities('manual')).toEqual({
      autoRenew: false,
      hostedPortal: false,
      providerInvoices: false,
    });
  });

  it('sans argument, les capacites sont celles du prestataire actif', () => {
    expect(billingCapabilities()).toEqual(billingCapabilities(ACTIVE_BILLING_PROVIDER));
  });
});
