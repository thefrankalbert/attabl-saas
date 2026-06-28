/**
 * Parcours 3: l'equipe se connecte, et les permissions tiennent.
 * Coeur de la securite multi-tenant: un role insuffisant ne doit pas atteindre
 * une action reservee (owner/admin), meme authentifie.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv } from './fixtures/env';
import { RESTAURANT_TEAM, newApiContext, loginPersona } from './fixtures/personas';
import { seedTenantWithMenu, seedStaffForTenant, teardownTenantBySlug } from './fixtures/seed';

const MANAGER = RESTAURANT_TEAM.find((p) => p.role === 'manager')!;

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
    test.beforeAll(async () => {
      test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');
      const seeded = await seedTenantWithMenu();
      // toute l'equipe: owner + manager + cashier + waiter(server) + chef(kitchen)
      await seedStaffForTenant(seeded.tenantId, RESTAURANT_TEAM);
    });

    test.afterAll(async () => {
      if (hasSeedEnv()) await teardownTenantBySlug();
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
  });
});
