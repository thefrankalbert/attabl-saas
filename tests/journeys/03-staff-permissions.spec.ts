/**
 * Parcours 3: l'equipe se connecte, et les permissions tiennent.
 * Coeur de la securite multi-tenant: un role insuffisant ne doit pas atteindre
 * une action reservee (owner/admin), meme authentifie.
 *
 * Lot 1 des roles (conception F.2): le parcours suit aussi un chef (il change
 * un prix, il ne voit pas les rapports d'argent) et une personne qui CUMULE
 * serveur et caissier (elle prend une commande et l'encaisse). Chaque refus a
 * son temoin: la meme requete, par une personne qui a le droit.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { hasSeedEnv, journeyEnv } from './fixtures/env';
import { RESTAURANT_TEAM, newApiContext, loginPersona, type Persona } from './fixtures/personas';
import {
  getAdmin,
  getOrderState,
  newUserClient,
  seedTenantWithMenu,
  seedStaffForTenant,
  seedZoneAndTable,
  teardownTenantBySlug,
  type SeededMenu,
} from './fixtures/seed';

const MANAGER = RESTAURANT_TEAM.find((p) => p.role === 'manager')!;
// `kitchen` est seede au poste `chef`, `server` au poste `waiter`.
const CHEF = RESTAURANT_TEAM.find((p) => p.role === 'kitchen')!;
const WAITER = RESTAURANT_TEAM.find((p) => p.role === 'server')!;
/** Une personne, deux postes: elle prend la commande ET l'encaisse. */
const WAITER_CASHIER: Persona = {
  key: 'server_cashier',
  side: 'restaurant',
  role: 'server',
  postes: ['waiter', 'cashier'],
  label: 'Serveur et caissier (cumul)',
  email: `servercashier+${journeyEnv.tenantSlug}@journey.test`,
  password: WAITER.password,
};

test.describe.serial('03 - Equipe & permissions', () => {
  // Reel SANS seed: une action sensible refuse un appelant non authentifie.
  test('une route sensible refuse un appel non authentifie', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/admin/reset', { data: {} });
    expect([401, 403, 400, 404]).toContain(res.status());
    expect(res.status(), 'ne doit jamais reussir sans droits').not.toBe(200);
    await ctx.dispose();
  });

  test.describe('roles seedes (base de TEST)', () => {
    let seeded: SeededMenu | null = null;

    test.beforeAll(async () => {
      test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
      seeded = await seedTenantWithMenu();
      // toute l'equipe: owner + manager + cashier + waiter(server) + chef(kitchen),
      // plus la personne qui cumule serveur et caissier.
      await seedStaffForTenant(seeded.tenantId, [...RESTAURANT_TEAM, WAITER_CASHIER]);
      // Une commande sur place exige une vraie table.
      await seedZoneAndTable(seeded.tenantId);
    });

    test.afterAll(async () => {
      if (hasSeedEnv()) await teardownTenantBySlug();
    });

    /** Commande de caisse; `payment_method` present = encaissement dans la foulee. */
    const posOrder = (ctx: Awaited<ReturnType<typeof loginPersona>>, pay: boolean) =>
      ctx.post('/api/orders/pos', {
        data: {
          table_number: '1',
          status: 'pending',
          service_type: 'dine_in',
          ...(pay ? { payment_method: 'cash' } : {}),
          items: [{ menu_item_id: (seeded as SeededMenu).menuItemId, quantity: 1 }],
        },
      });

    test('un manager authentifie ne peut pas reset les donnees du tenant (owner/admin only)', async () => {
      test.skip(!hasSeedEnv(), 'seed indisponible');
      const ctx = await loginPersona(MANAGER);
      const res = await ctx.post('/api/admin/reset', { data: {} });
      // /api/admin/reset exige role owner/admin -> manager refuse. Jamais 200.
      expect(res.status(), `manager doit etre refuse, recu ${res.status()}`).not.toBe(200);
      expect([401, 403]).toContain(res.status());
      await ctx.dispose();
    });

    // ---------------------------------------------------------------------
    // Le chef: la carte et les prix, pas l'argent.
    // ---------------------------------------------------------------------
    test('le chef change un prix (menu.price), le serveur non', async () => {
      test.skip(!seeded, 'seed indisponible');
      test.skip(!journeyEnv.supabaseAnonKey, 'JOURNEY_SUPABASE_ANON_KEY requis (session reelle).');
      const item = seeded as SeededMenu;
      const prix = async () =>
        (await getAdmin().from('menu_items').select('price').eq('id', item.menuItemId).single())
          .data?.price as number;

      // Temoin negatif: le serveur n'a ni menu.edit ni menu.price. La RLS ne leve
      // pas d'erreur sur un UPDATE refuse (0 ligne): on relit le prix.
      const serveur = await newUserClient(WAITER.email!, WAITER.password!);
      await serveur
        .from('menu_items')
        .update({ price: item.price + 700 })
        .eq('id', item.menuItemId);
      expect(await prix(), 'le serveur ne doit pas avoir change le prix').toBe(item.price);

      const chef = await newUserClient(CHEF.email!, CHEF.password!);
      const { error } = await chef
        .from('menu_items')
        .update({ price: item.price + 500 })
        .eq('id', item.menuItemId);
      expect(error, error?.message).toBeNull();
      expect(await prix(), 'le chef a change le prix').toBe(item.price + 500);

      // Remise en etat pour les tests suivants (le prix sert au calcul des commandes).
      await getAdmin().from('menu_items').update({ price: item.price }).eq('id', item.menuItemId);
    });

    test('le chef ne voit pas les rapports d argent, le gerant si', async () => {
      test.skip(!seeded, 'seed indisponible');
      const reports = `/sites/${journeyEnv.tenantSlug}/admin/reports`;

      const chef = await loginPersona(CHEF);
      const refuse = await chef.get(reports, { maxRedirects: 0 });
      expect(refuse.status(), 'le chef est renvoye').toBe(307);
      expect(refuse.headers().location).toContain('/unauthorized');
      await chef.dispose();

      // Temoin: la meme page, le gerant (reports.money) n'est pas renvoye.
      const gerant = await loginPersona(MANAGER);
      const admis = await gerant.get(reports, { maxRedirects: 0 });
      expect(admis.status(), 'le gerant ouvre les rapports').toBe(200);
      await gerant.dispose();
    });

    // ---------------------------------------------------------------------
    // Cumul serveur et caissier: prendre la commande ET l'encaisser.
    // ---------------------------------------------------------------------
    test('le serveur seul prend une commande mais ne l encaisse pas', async () => {
      test.skip(!seeded, 'seed indisponible');
      const ctx = await loginPersona(WAITER);

      const prise = await posOrder(ctx, false);
      expect(prise.status(), await prise.text()).toBe(200);
      const orderId = ((await prise.json()) as { orderId?: string }).orderId as string;
      expect((await getOrderState(orderId))?.payment_status).toBe('pending');

      // Decision G.b.1: le serveur n'encaisse pas au lot 1.
      const encaisse = await posOrder(ctx, true);
      expect(encaisse.status(), 'un serveur seul ne doit pas encaisser').toBe(403);
      await ctx.dispose();
    });

    test('serveur ET caissier (cumul): prend une commande et l encaisse', async () => {
      test.skip(!seeded, 'seed indisponible');
      const ctx = await loginPersona(WAITER_CASHIER);
      const res = await posOrder(ctx, true);
      expect(res.status(), await res.text()).toBe(200);
      const orderId = ((await res.json()) as { orderId?: string }).orderId as string;
      expect(orderId).toBeTruthy();
      expect((await getOrderState(orderId))?.payment_status).toBe('paid');
      await ctx.dispose();
    });

    // ---------------------------------------------------------------------
    // Cuisine: "en preparation" est un geste de cuisine (kitchen.track).
    // ---------------------------------------------------------------------
    test('le serveur ne passe pas une commande en preparation, le chef si ; le serveur la sert', async () => {
      test.skip(!seeded, 'seed indisponible');
      const serveur = await loginPersona(WAITER);
      const prise = await posOrder(serveur, false);
      expect(prise.status(), await prise.text()).toBe(200);
      const orderId = ((await prise.json()) as { orderId?: string }).orderId as string;
      const statut = (ctx: typeof serveur, status: string) =>
        ctx.post('/api/orders/mutations', {
          data: { type: 'status', client_request_id: randomUUID(), orderId, status },
        });

      const refus = await statut(serveur, 'preparing');
      expect(refus.status(), 'refus metier, pas une panne').toBe(422);
      expect((await getOrderState(orderId))?.status).toBe('pending');

      // Temoin: la meme requete par le chef passe.
      const chef = await loginPersona(CHEF);
      const admis = await statut(chef, 'preparing');
      expect(admis.status(), await admis.text()).toBe(200);
      expect((await getOrderState(orderId))?.status).toBe('preparing');
      await chef.dispose();

      // Servir reste le geste du serveur.
      const servi = await statut(serveur, 'delivered');
      expect(servi.status(), await servi.text()).toBe(200);
      expect((await getOrderState(orderId))?.status).toBe('delivered');
      await serveur.dispose();
    });
  });
});
