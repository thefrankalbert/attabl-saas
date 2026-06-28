/**
 * Parcours 4: le service tourne. Convives commandent, cuisine suit, on encaisse.
 *
 * - Sans seed: la validation serveur rejette une commande vide (toujours jouable).
 * - Happy-path commande + manipulation de prix: necessite un menu seede sur la
 *   base de TEST (JOURNEY_SUPABASE_URL + SERVICE_ROLE_KEY). On seede tenant + menu
 *   + article via service_role, puis on commande via la vraie route /api/orders.
 *
 * Le serveur revalide le prix contre la DB (order.service.validateOrderItems ->
 * ServiceError VALIDATION -> 400): un prix falsifie est rejete.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv } from './fixtures/env';
import { newApiContext } from './fixtures/personas';
import { seedTenantWithMenu, teardownTenantBySlug, type SeededMenu } from './fixtures/seed';

test.describe.serial('04 - Service & commandes', () => {
  test('une commande vide est rejetee (validation serveur)', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/orders', {
      data: { items: [], tableNumber: '1', service_type: 'dine_in' },
    });
    // 400 = validation ; 429 = rate limit (acceptable) ; jamais 2xx sur panier vide.
    expect([400, 422, 429]).toContain(res.status());
    await ctx.dispose();
  });

  test.describe('happy-path (necessite la base de TEST seedee)', () => {
    let seeded: SeededMenu | null = null;

    test.beforeAll(async () => {
      test.skip(
        !hasSeedEnv(),
        'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis pour seeder le menu (base de TEST).',
      );
      seeded = await seedTenantWithMenu();
    });

    test.afterAll(async () => {
      if (hasSeedEnv()) await teardownTenantBySlug();
    });

    test('un convive passe une commande valide (QR)', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const ctx = await newApiContext();
      const res = await ctx.post('/api/orders', {
        data: {
          items: [{ id: item.menuItemId, name: item.itemName, price: item.price, quantity: 2 }],
          tableNumber: '12',
          service_type: 'dine_in',
        },
      });
      // Prix correct -> commande creee (2xx). En cas de 429 (rate limit) on tolere.
      expect([200, 201, 429], `statut ${res.status()} - ${await res.text()}`).toContain(
        res.status(),
      );
      await ctx.dispose();
    });

    test('une manipulation de prix est rejetee (revalidation serveur)', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const ctx = await newApiContext();
      const res = await ctx.post('/api/orders', {
        data: {
          items: [
            {
              id: item.menuItemId,
              name: item.itemName,
              // Prix falsifie (sous le prix DB): doit etre refuse.
              price: Math.max(0, item.price - 1000),
              quantity: 1,
            },
          ],
          tableNumber: '12',
          service_type: 'dine_in',
        },
      });
      // Jamais 2xx: le serveur recalcule le prix et rejette (400 VALIDATION).
      expect(
        res.status(),
        `un prix falsifie ne doit jamais passer (recu ${res.status()})`,
      ).toBeGreaterThanOrEqual(400);
      await ctx.dispose();
    });
  });

  test('la cuisine voit la commande en temps reel (KDS)', async () => {
    test.skip(
      true,
      'TODO: UI - ouvrir le KDS en page authentifiee (cuisine), asserter l apparition de la commande via le broadcast realtime.',
    );
  });

  test('le serveur encaisse (POS)', async () => {
    test.skip(true, 'TODO: UI/POS - passer la commande en payee (cash) et verifier le statut.');
  });
});
