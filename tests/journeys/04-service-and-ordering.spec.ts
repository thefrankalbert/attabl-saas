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
  newRealtimeClient,
  setOrderStatus,
  teardownTenantBySlug,
  type SeededMenu,
} from './fixtures/seed';

/** Petit deferred: une promesse + son resolveur, pour capturer un event realtime. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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
      // Rejet par VALIDATION serveur (400/422). On EXCLUT 500 (un crash n'est pas une
      // validation) et on tolere 429 (rate limit environnemental). Avant, un >=400
      // global masquait un 500.
      expect(
        [400, 422, 429],
        `un prix falsifie doit etre rejete par validation, pas crasher (recu ${res.status()})`,
      ).toContain(res.status());
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

    test('la commande POS apparait au KDS en temps reel (CDC) et le statut se propage', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const tenantId = item.tenantId;

      // Le KDS s'abonne au CDC Postgres: channel kds_orders_<tenantId>, table orders,
      // filtre tenant_id. On reproduit exactement cet abonnement (cf useKitchenData).
      const rt = newRealtimeClient();
      const inserted = deferred<{ id: string }>();
      const updated = deferred<{ id: string; status: string }>();
      const channel = rt
        .channel(`kds_orders_${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => inserted.resolve(payload.new as { id: string }),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => updated.resolve(payload.new as { id: string; status: string }),
        );

      try {
        // Attend l'abonnement effectif avant de creer la commande (sinon on rate l'event).
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('abonnement realtime: timeout')), 15000);
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(t);
              resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(t);
              reject(new Error(`abonnement realtime: ${status}`));
            }
          });
        });

        // Le statut SUBSCRIBED est acquitte avant que le serveur Realtime n'ait fini
        // de cabler le listener postgres_changes (fenetre connue Supabase): on laisse
        // le replication slot se mettre en place avant de creer la commande.
        await new Promise((r) => setTimeout(r, 2500));

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
        const orderId = ((await res.json()) as { orderId?: string }).orderId as string;
        await ctx.dispose();

        // 1) La nouvelle commande arrive cote cuisine en live (event INSERT).
        const insertRow = await Promise.race([
          inserted.promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('event INSERT KDS: timeout')), 15000),
          ),
        ]);
        expect(insertRow.id).toBe(orderId);

        // 2) Le changement de statut se propage en live (event UPDATE).
        await setOrderStatus(tenantId, orderId, 'preparing');
        const updateRow = await Promise.race([
          updated.promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('event UPDATE KDS: timeout')), 15000),
          ),
        ]);
        expect(updateRow.id).toBe(orderId);
        expect(updateRow.status).toBe('preparing');

        // Sanity DB: zone de preparation valide (le KDS cuisine la voit).
        const state = await getOrderState(orderId);
        expect(['kitchen', 'bar', 'both', 'mixed']).toContain(state?.preparation_zone);
      } finally {
        await rt.removeAllChannels();
        await rt.realtime.disconnect();
      }
    });
  });
});
