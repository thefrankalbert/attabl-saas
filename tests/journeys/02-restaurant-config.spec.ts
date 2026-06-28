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
  seedTenantWithMenu,
  seedStaffForTenant,
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

  test('creer des tables et zones (avec QR)', async () => {
    test.skip(
      true,
      'TODO: creation tables/zones via UI admin /sites/<slug>/admin ou Server Action (pas de route REST).',
    );
  });

  test('creer un coupon de reduction', async () => {
    test.skip(
      true,
      'TODO: creation coupon via admin (pas de route REST POST). Le parcours 07 teste deja la VALIDATION d un coupon.',
    );
  });
});
