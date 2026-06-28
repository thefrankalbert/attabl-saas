/**
 * Parcours 4: le service tourne. Convives commandent, cuisine suit, on encaisse.
 *
 * - Sans seed: la validation serveur rejette une commande vide (toujours jouable).
 * - Happy-path commande + prix + POS + routage cuisine: necessite un menu seede
 *   sur la base de TEST (JOURNEY_SUPABASE_URL + SERVICE_ROLE_KEY). On seede tenant
 *   + menu + equipe via service_role, puis on commande via les vraies routes.
 *
 * Le serveur revalide le prix contre la DB (order.service.validateOrderItems ->
 * ServiceError VALIDATION -> 400): un prix falsifie est rejete.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv } from './fixtures/env';
import { RESTAURANT_TEAM, loginPersona, newApiContext } from './fixtures/personas';
import {
  seedTenantWithMenu,
  seedStaffForTenant,
  getOrderState,
  teardownTenantBySlug,
  type SeededMenu,
} from './fixtures/seed';

const CASHIER = RESTAURANT_TEAM.find((p) => p.role === 'cashier')!;

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
      await seedStaffForTenant(seeded.tenantId, [CASHIER]);
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

    test('le caissier encaisse une commande POS (cash) -> payee', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const ctx = await loginPersona(CASHIER);
      const res = await ctx.post('/api/orders/pos', {
        data: {
          table_number: '5',
          status: 'delivered',
          service_type: 'dine_in',
          payment_method: 'cash',
          items: [{ menu_item_id: item.menuItemId, quantity: 1 }],
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = (await res.json()) as { success?: boolean; orderId?: string };
      expect(body.success).toBe(true);
      expect(body.orderId).toBeTruthy();
      // Le serveur a applique le paiement: payment_status passe a 'paid'.
      const state = await getOrderState(body.orderId as string);
      expect(state?.payment_status).toBe('paid');
      await ctx.dispose();
    });

    test('la commande POS est routee vers la cuisine (KDS)', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const ctx = await loginPersona(CASHIER);
      const res = await ctx.post('/api/orders/pos', {
        data: {
          table_number: '6',
          status: 'pending',
          service_type: 'dine_in',
          items: [{ menu_item_id: item.menuItemId, quantity: 1 }],
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = (await res.json()) as { orderId?: string };
      // La commande existe avec une zone de preparation -> le KDS cuisine la voit.
      // (le push temps reel est assure par le broadcast applicatif, non asserte ici)
      const state = await getOrderState(body.orderId as string);
      expect(state, 'la commande doit exister cote cuisine').toBeTruthy();
      expect(['kitchen', 'bar', 'both', 'mixed']).toContain(state?.preparation_zone);
      await ctx.dispose();
    });
  });
});
