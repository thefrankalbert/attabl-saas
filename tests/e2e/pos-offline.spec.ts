import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * OFF-01 / OFF-06 / OFF-11 - le scenario de reference du LOT 3.
 *
 * Le caissier compose 6 commandes pendant une coupure reseau. Au retour du
 * reseau, la cuisine doit en recevoir EXACTEMENT 6. Moins de 6 = des commandes
 * perdues. Plus de 6 = des doublons factures deux fois au client. Les deux sont
 * bloquants pour un restaurant en service, et c'est l'absence de ce test qui a
 * laisse passer OFF-01: les mutations TanStack etaient mises en pause hors ligne,
 * si bien que l'envoi echouait en silence.
 *
 * Pourquoi couper au niveau HTTP (`route.abort`) plutot qu'avec
 * `context.setOffline`: on veut exercer le VRAI chemin applicatif
 * (handleOrder -> submitOrder -> outbox IndexedDB -> drain au retour) et compter
 * ce qui arrive reellement au serveur. `abort('internetdisconnected')` reproduit
 * ce que voit l'application quand le wifi tombe - une promesse fetch rejetee, pas
 * une reponse HTTP. La nuance compte: un 5xx serait classe differemment par la
 * file (il consomme le budget de tentatives, pas une coupure).
 *
 * L'assertion porte sur les cles d'idempotence recues, jamais sur l'etat de la
 * base. Le test reste donc valable sans jeu de donnees particulier, et ne peut
 * pas ecrire dans une base reelle.
 *
 * Le bouton utilise est "envoyer en production" (`pos-send-order`), qui appelle
 * handleOrder('pending') directement. L'autre bouton ouvre la modale de paiement,
 * un parcours plus long qui n'ajoute rien a ce que ce test verifie.
 *
 * Prerequis: serveur de dev avec ALLOW_DEV_AUTH_BYPASS=true et un tenant qui a
 * des articles au menu (voir admin-dashboard.spec.ts, meme prerequis). En local,
 * passer par le harnais du LOT 7: `bash scripts/run-journeys-local.sh`.
 */

const POS_URL = '/sites/blutable/admin/pos';
const ORDER_ENDPOINT = '**/api/orders/pos';
const EXPECTED_ORDERS = 6;

interface Captured {
  /** Cles d'idempotence vues par le serveur, dans l'ordre d'arrivee. */
  keys: string[];
  /** Nombre total d'appels recus, doublons compris. */
  calls: number;
}

function orderResponse(n: number): string {
  return JSON.stringify({
    success: true,
    orderId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    orderNumber: `E2E-${n}`,
    total: 0,
  });
}

/** Compose une commande (un article) et l'envoie en production. */
async function composeAndSend(page: Page): Promise<void> {
  const firstItem = page.getByTestId('pos-menu-item').first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();
  await page.getByTestId('pos-send-order').click();
}

test.describe('POS hors ligne - 6 commandes, ni perte ni doublon', () => {
  test('les 6 commandes composees hors ligne arrivent une seule fois chacune', async ({ page }) => {
    const state = { offline: false };
    const captured: Captured = { keys: [], calls: 0 };

    await page.route(ORDER_ENDPOINT, async (route: Route) => {
      if (state.offline) {
        await route.abort('internetdisconnected');
        return;
      }
      captured.calls += 1;
      const body = route.request().postDataJSON() as { client_request_id?: string } | null;
      if (body?.client_request_id) captured.keys.push(body.client_request_id);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: orderResponse(captured.calls),
      });
    });

    await page.goto(POS_URL);
    await expect(page.getByTestId('pos-menu-item').first()).toBeVisible();

    // --- Coupure reseau --------------------------------------------------
    state.offline = true;

    for (let i = 0; i < EXPECTED_ORDERS; i += 1) {
      await composeAndSend(page);
      // Le compteur doit MONTER a chaque envoi. Une erreur rouge ou un compteur
      // fige signifierait qu'OFF-01 est revenu: la commande n'est pas capturee.
      await expect(page.getByTestId('outbox-pending-count')).toHaveText(String(i + 1));
    }

    expect(captured.calls, 'appels serveur pendant la coupure').toBe(0);

    // --- Retour du reseau ------------------------------------------------
    state.offline = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Le bandeau disparait quand la file est vide (showPending devient faux).
    await expect(page.getByTestId('outbox-pending-count')).toHaveCount(0, { timeout: 30_000 });

    // Le coeur du test. Moins de 6 = perte seche. Plus de 6 = doublons factures.
    expect(captured.keys.length, 'commandes recues par le serveur').toBe(EXPECTED_ORDERS);
    expect(new Set(captured.keys).size, "cles d'idempotence distinctes").toBe(EXPECTED_ORDERS);
  });

  test('un retap apres echec rejoue la meme cle au lieu d en creer une seconde', async ({
    page,
  }) => {
    // OFF-11. Le premier envoi echoue cote serveur, le panier n'est donc PAS
    // vide, et le caissier retape. C'est la meme commande: elle doit porter la
    // meme cle, sinon le rejeu cree un doublon que plus rien ne rattrape.
    const captured: Captured = { keys: [], calls: 0 };
    let failNext = true;

    await page.route(ORDER_ENDPOINT, async (route: Route) => {
      captured.calls += 1;
      const body = route.request().postDataJSON() as { client_request_id?: string } | null;
      if (body?.client_request_id) captured.keys.push(body.client_request_id);
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'refus e2e' }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: orderResponse(captured.calls),
      });
    });

    await page.goto(POS_URL);
    await expect(page.getByTestId('pos-menu-item').first()).toBeVisible();

    await composeAndSend(page);
    await composeAndSend(page);

    expect(captured.keys.length, 'deux envois attendus').toBe(2);
    expect(new Set(captured.keys).size, 'la cle doit etre rejouee, pas refrappee').toBe(1);
  });
});
