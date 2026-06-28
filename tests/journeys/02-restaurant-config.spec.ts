/**
 * Parcours 2: le proprietaire configure son restaurant.
 * Menu, items, variantes, tables, zones, coupons.
 *
 * Beaucoup de ces actions passent par des Server Actions / l'UI admin plutot que
 * par des routes REST. Les etapes UI sont marquees TODO (a cabler avec les vrais
 * selecteurs ou les Server Actions). Ce qui est verifiable en API est reel.
 */
import { test, expect } from '@playwright/test';
import { OWNER, loginPersona } from './fixtures/personas';

test.describe.serial('02 - Configuration restaurant', () => {
  test('le proprietaire accede a son espace (etat onboarding)', async () => {
    const ctx = await loginPersona(OWNER);
    const res = await ctx.get('/api/onboarding/state');
    expect(res.status()).toBeLessThan(400);
    await ctx.dispose();
  });

  test('creer le menu et des items', async () => {
    test.skip(
      true,
      'TODO: cabler la creation de menu/items (Server Action admin ou UI). Renseigner les IDs crees dans .state pour le parcours 04.',
    );
  });

  test('creer des tables et zones (avec QR)', async () => {
    test.skip(
      true,
      'TODO: cabler creation tables/zones via UI admin /sites/<slug>/admin ou Server Action.',
    );
  });

  test('creer un coupon de reduction', async () => {
    test.skip(
      true,
      'TODO: cabler creation coupon (admin). Le parcours 07 teste deja la VALIDATION d un coupon.',
    );
  });
});
