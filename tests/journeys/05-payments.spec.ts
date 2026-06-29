/**
 * Parcours 5: encaissement.
 *
 * Attabl encaisse en ESPECES uniquement pour l'instant. Le mobile money
 * (Wave, Orange Money, MTN MoMo, Free Money) a ete retire du produit
 * (cf. docs/MOBILE-MONEY-RETRAIT.md) - les flux fournisseurs n'existent plus.
 *
 * L'encaissement cash POS est deja exerce EN REEL dans le parcours 04
 * ("caissier encaisse une commande POS en cash" -> payment_status='paid').
 * Ce fichier ne re-teste donc rien : il documente le perimetre paiement.
 *
 * A la reactivation d'un moyen mobile money: re-ajouter ici les tests
 * d'initiation/callback en meme temps que le client provider + ses routes.
 */
import { test } from '@playwright/test';

test.describe.serial('05 - Paiements', () => {
  test('encaissement cash (POS)', async () => {
    test.skip(
      true,
      'Couvert en reel par le parcours 04 (POS cash -> payment_status=paid). Cash est le seul moyen actif; le mobile money a ete retire du produit.',
    );
  });
});
