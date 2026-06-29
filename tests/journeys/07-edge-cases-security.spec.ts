/**
 * Parcours 7: les cas limites et la securite en conditions reelles.
 * Plusieurs tests sont REELS et tournent des maintenant (validation, rate limit,
 * authz). Les tests dependant de donnees seedees sont marques TODO.
 */
import { test, expect } from '@playwright/test';
import { hasRateLimitEnv, hasSeedEnv, journeyEnv } from './fixtures/env';
import { newApiContext } from './fixtures/personas';
import {
  seedCoupon,
  seedTenantWithMenu,
  teardownTenantBySlug,
  type SeededMenu,
} from './fixtures/seed';

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
    // Aucune 5xx en rafale (toujours vrai).
    expect(
      statuses.every((s) => s < 500),
      `statuts: ${statuses.join(',')}`,
    ).toBeTruthy();
    const got429 = statuses.includes(429);
    if (hasRateLimitEnv()) {
      // Cible avec rate limiting actif (Upstash branche): la rafale DOIT finir limitee.
      expect(got429, `aucun 429 sur 25 requetes: ${[...new Set(statuses)].join(',')}`).toBe(true);
    } else {
      // Runner local: Upstash vide -> rate limiting desactive, on ne peut pas observer
      // de 429. On l'annonce (vert honnete = smoke "pas de 5xx"), pas un faux "couvert".
      console.log(
        `[rate-limit] desactive sur cette cible (Upstash vide). Pose JOURNEY_RATE_LIMIT_ACTIVE=yes ` +
          `sur un env avec Upstash pour exiger un 429. 429 observe: ${got429}.`,
      );
    }
    await ctx.dispose();
  });

  test('une action sensible refuse un appel non authentifie', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/admin/reset', { data: {} });
    expect(res.status(), 'ne doit jamais reussir sans droits').not.toBe(200);
    await ctx.dispose();
  });

  // La manipulation de prix (price_mismatch) est testee en reel dans le parcours 04
  // (POST /api/orders avec un price abaisse -> rejet). L'isolation cross-tenant
  // (BOLA) a son propre parcours dedie: 08-bola.spec.ts.

  test.describe.serial('coupon applique (base de TEST seedee)', () => {
    let seeded: SeededMenu | null = null;

    test.beforeAll(async () => {
      test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
      seeded = await seedTenantWithMenu();
      await seedCoupon(seeded.tenantId, { code: 'JOURNEY10', discountValue: 10 });
    });

    test.afterAll(async () => {
      if (hasSeedEnv()) await teardownTenantBySlug();
    });

    test('un coupon valide reduit le total de la commande', async () => {
      test.skip(!seeded, 'seed indisponible');
      const item = seeded as SeededMenu;
      const orderItems = [
        { id: item.menuItemId, name: item.itemName, price: item.price, quantity: 1 },
      ];

      const ctx = await newApiContext();

      const baseRes = await ctx.post('/api/orders', { data: { items: orderItems } });
      expect(baseRes.status(), await baseRes.text()).toBeLessThan(400);
      const baseTotal = ((await baseRes.json()) as { total: number }).total;

      const couponRes = await ctx.post('/api/orders', {
        data: { items: orderItems, coupon_code: 'JOURNEY10' },
      });
      expect(couponRes.status(), await couponRes.text()).toBeLessThan(400);
      const couponTotal = ((await couponRes.json()) as { total: number }).total;

      // -10% sur l'article: le total avec coupon doit etre strictement inferieur.
      expect(couponTotal, `base=${baseTotal} coupon=${couponTotal}`).toBeLessThan(baseTotal);
      await ctx.dispose();
    });

    test('validation coupon: refuse un code bidon, accepte le code valide', async () => {
      test.skip(!seeded, 'seed indisponible');
      const ctx = await newApiContext();
      const slug = journeyEnv.tenantSlug;

      // Tenant seede existe -> reponse deterministe 200 (plus de 404 ambigu).
      const bad = await ctx.post('/api/coupons/validate', {
        data: { code: 'NOPE-INVALID-0000', subtotal: 5000, tenantSlug: slug },
      });
      expect(bad.status(), await bad.text()).toBe(200);
      expect((await bad.json()).valid, 'un code bidon ne doit jamais etre valide').toBe(false);

      const good = await ctx.post('/api/coupons/validate', {
        data: { code: 'JOURNEY10', subtotal: 5000, tenantSlug: slug },
      });
      expect(good.status(), await good.text()).toBe(200);
      const goodBody = await good.json();
      expect(goodBody.valid, 'le coupon seede doit etre valide').toBe(true);
      expect(goodBody.discountAmount, 'remise -10% sur 5000 = 500').toBeGreaterThan(0);
      await ctx.dispose();
    });
  });
});
