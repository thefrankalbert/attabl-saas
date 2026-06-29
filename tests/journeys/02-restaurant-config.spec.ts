/**
 * Parcours 2: le proprietaire configure son restaurant.
 * Menu, items, variantes, tables, zones, coupons.
 *
 * Reel (base de test seedee): le proprietaire se connecte et accede a son espace;
 * le menu seede est visible via l'API publique. Les creations tables/zones/coupon
 * passent par des Server Actions / l'UI admin (pas de route REST) -> TODO.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv } from './fixtures/env';
import { OWNER, loginPersona, newApiContext } from './fixtures/personas';
import {
  getAdmin,
  seedCoupon,
  seedTenantWithMenu,
  seedStaffForTenant,
  seedZoneAndTable,
  teardownTenantBySlug,
  type SeededMenu,
} from './fixtures/seed';

test.describe.serial('02 - Configuration restaurant', () => {
  let seeded: SeededMenu | null = null;

  test.beforeAll(async () => {
    test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
    seeded = await seedTenantWithMenu();
    await seedStaffForTenant(seeded.tenantId, [OWNER]);
  });

  test.afterAll(async () => {
    if (hasSeedEnv()) await teardownTenantBySlug();
  });

  test('le proprietaire accede a son espace (etat onboarding)', async () => {
    test.skip(!seeded, 'seed indisponible');
    const ctx = await loginPersona(OWNER);
    const res = await ctx.get('/api/onboarding/state');
    // Authentifie + route joignable: pas d'erreur serveur ni de refus d'auth.
    expect(res.status(), `onboarding/state -> ${res.status()}: ${await res.text()}`).toBeLessThan(
      500,
    );
    expect([401, 403]).not.toContain(res.status());
    await ctx.dispose();
  });

  test('le menu seede est visible (API menu)', async () => {
    test.skip(!seeded, 'seed indisponible');
    const item = seeded as SeededMenu;
    const ctx = await newApiContext();
    const res = await ctx.get('/api/menu-search');
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items?: Array<{ name: string }> };
    const names = (body.items ?? []).map((i) => i.name);
    expect(names).toContain(item.itemName);
    await ctx.dispose();
  });

  test('creer une zone et une table', async () => {
    test.skip(!seeded, 'seed indisponible');
    const { tenantId } = seeded as SeededMenu;
    const { zoneId, tableId } = await seedZoneAndTable(tenantId);
    const db = getAdmin();

    // La zone existe et est bien rattachee au tenant.
    const { data: zone } = await db
      .from('zones')
      .select('id, tenant_id, name')
      .eq('id', zoneId)
      .maybeSingle();
    expect(zone?.tenant_id).toBe(tenantId);

    // La table existe, rattachee au tenant et a la zone.
    const { data: tableRow } = await db
      .from('tables')
      .select('id, tenant_id, zone_id, display_name')
      .eq('id', tableId)
      .maybeSingle();
    expect(tableRow?.tenant_id).toBe(tenantId);
    expect(tableRow?.zone_id).toBe(zoneId);
  });

  test('creer un coupon de reduction', async () => {
    test.skip(!seeded, 'seed indisponible');
    const { tenantId } = seeded as SeededMenu;
    const coupon = await seedCoupon(tenantId, { code: 'JOURNEY10', discountValue: 10 });
    const db = getAdmin();

    const { data: row } = await db
      .from('coupons')
      .select('id, tenant_id, code, discount_type, discount_value, is_active')
      .eq('id', coupon.id)
      .maybeSingle();
    expect(row?.tenant_id).toBe(tenantId);
    expect(row?.code).toBe('JOURNEY10');
    expect(row?.is_active).toBe(true);
    // L application reelle du coupon (reduction du total) est verifiee dans le
    // parcours 07 via POST /api/orders.
  });
});
