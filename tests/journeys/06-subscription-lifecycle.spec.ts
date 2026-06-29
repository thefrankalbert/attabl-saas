/**
 * Parcours 6: cycle de vie de l'abonnement dans le TEMPS (Stripe Test Clocks).
 * Renouvellement, fin d'essai, echec de paiement, annulation - sans attendre un an.
 *
 * Ne tourne que si JOURNEY_STRIPE_SECRET_KEY (sk_test_) est fourni.
 */
import { test, expect } from '@playwright/test';
import { hasStripeTestEnv } from './fixtures/env';
import { advanceTestClock, createTestClock } from './fixtures/stripe';

test.describe.serial('06 - Cycle de vie abonnement', () => {
  test('creer une horloge de test et avancer le temps', async () => {
    test.skip(!hasStripeTestEnv(), 'JOURNEY_STRIPE_SECRET_KEY (sk_test_) requis.');
    const now = Math.floor(Date.now() / 1000);
    const clockId = await createTestClock(now);
    expect(clockId).toMatch(/^clock_/);
    // Avance d'environ 1 mois pour declencher un renouvellement mensuel.
    const oneMonth = now + 31 * 24 * 3600;
    await advanceTestClock(clockId, oneMonth);
    // TODO: rattacher un customer+subscription a cette horloge (au checkout, passer
    // test_clock=clockId), puis asserter via /api/webhooks/stripe que le
    // renouvellement (invoice.payment_succeeded) met a jour l'abonnement en base.
  });

  test('echec de paiement au renouvellement -> abonnement en past_due', async () => {
    test.skip(
      true,
      'TODO: utiliser une carte de test qui echoue au renouvellement + Test Clock, verifier le statut past_due cote app.',
    );
  });

  test('annulation -> acces retire a la fin de periode', async () => {
    test.skip(
      true,
      'TODO: annuler l abonnement, avancer l horloge a la fin de periode, verifier la perte d acces.',
    );
  });
});
