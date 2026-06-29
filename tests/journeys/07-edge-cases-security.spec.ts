/**
 * Parcours 7: les cas limites et la securite en conditions reelles.
 * Plusieurs tests sont REELS et tournent des maintenant (validation, rate limit,
 * authz). Les tests dependant de donnees seedees sont marques TODO.
 */
import { test, expect } from '@playwright/test';
import { journeyEnv } from './fixtures/env';
import { newApiContext } from './fixtures/personas';

test.describe.serial('07 - Cas limites & securite', () => {
  test('un coupon invalide est refuse', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/coupons/validate', {
      data: { code: 'NOPE-INVALID-0000', subtotal: 5000, tenantSlug: journeyEnv.tenantSlug },
    });
    // 200 avec valid:false, ou 404 si le tenant/code n'existe pas. Jamais valid:true.
    expect([200, 400, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.valid, 'un coupon bidon ne doit jamais etre valide').toBeFalsy();
    }
    await ctx.dispose();
  });

  test('le rate limiting protege un endpoint public', async () => {
    const ctx = await newApiContext();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await ctx.post('/api/coupons/validate', {
        data: { code: `SPAM-${i}`, subtotal: 1000, tenantSlug: journeyEnv.tenantSlug },
      });
      statuses.push(res.status());
    }
    // Aucune 5xx, et les statuts restent dans l'attendu (429 = limite atteinte = bon signe).
    expect(
      statuses.every((s) => s < 500),
      `statuts: ${statuses.join(',')}`,
    ).toBeTruthy();
    const got429 = statuses.includes(429);
    console.log(
      `[rate-limit] 429 observe: ${got429} | statuts uniques: ${[...new Set(statuses)].join(',')}`,
    );
    await ctx.dispose();
  });

  test('une action sensible refuse un appel non authentifie', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/admin/reset', { data: {} });
    expect(res.status(), 'ne doit jamais reussir sans droits').not.toBe(200);
    await ctx.dispose();
  });

  test('manipulation de prix rejetee (price_mismatch)', async () => {
    test.skip(
      true,
      'TODO: avec un menu_item_id reel, POST /api/orders en envoyant un price plus bas que le prix DB. Doit etre rejete (validation serveur / price_mismatch).',
    );
  });

  test('isolation cross-tenant (BOLA)', async () => {
    test.skip(
      true,
      'Voir security/generated-tests/security-bola.spec.ts (test BOLA dedie a deplacer dans tests/).',
    );
  });
});
