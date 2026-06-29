/**
 * Parcours 5: encaissement multi-methodes.
 * Attabl gere cash, carte, Wave et Orange Money (mobile money).
 *
 * Ces flux dependent des sandboxes des fournisseurs (Wave/Orange Money) et de
 * commandes existantes. Structure prete, etapes marquees TODO la ou il faut les
 * identifiants sandbox.
 */
import { test, expect } from '@playwright/test';

test.describe.serial('05 - Paiements', () => {
  test('paiement cash (POS) marque la commande payee', async () => {
    test.skip(
      true,
      'TODO: depend d une commande creee (parcours 04) + action POS encaissement cash.',
    );
  });

  test('paiement Wave initie une session de paiement', async () => {
    test.skip(
      true,
      'TODO: necessite Wave active sur le tenant + sandbox Wave. POST /api/orders/<id>/pay-wave.',
    );
  });

  test('paiement Orange Money initie une session', async () => {
    test.skip(
      true,
      'TODO: necessite Orange Money active + sandbox. POST /api/orders/<id>/pay-orange-money.',
    );
  });

  test('un echec de paiement laisse la commande NON payee', async () => {
    test.skip(
      true,
      'TODO: simuler un callback d echec (Wave/Orange Money) et verifier que le statut reste impaye.',
    );
    expect(true).toBeTruthy();
  });
});
