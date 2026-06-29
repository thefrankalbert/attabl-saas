/**
 * Preflight: verifie l'environnement AVANT de derouler la journee.
 * - garde-fou anti-prod
 * - serveur joignable
 * - base propre si la base de test est fournie
 */
import { test, expect } from '@playwright/test';
import { assertNotProduction, hasSeedEnv, hasStripeTestEnv, journeyEnv } from './fixtures/env';
import { newApiContext } from './fixtures/personas';
import { teardownTenantBySlug } from './fixtures/seed';

test.describe.serial('00 - Preflight', () => {
  test('garde-fou: on ne cible pas la production', () => {
    expect(() => assertNotProduction()).not.toThrow();
  });

  test('le serveur cible repond', async () => {
    const ctx = await newApiContext();
    const res = await ctx.get('/api/health');
    expect(res.status(), `GET ${journeyEnv.baseURL}/api/health`).toBeLessThan(500);
    await ctx.dispose();
  });

  test('etat de la config (info)', () => {
    console.log(
      `[preflight] baseURL=${journeyEnv.baseURL} | seedDB=${hasSeedEnv()} | stripeTest=${hasStripeTestEnv()} | tenant=${journeyEnv.tenantSlug}`,
    );
    expect(true).toBeTruthy();
  });

  test('base propre (si base de test fournie)', async () => {
    test.skip(
      !hasSeedEnv(),
      'JOURNEY_SUPABASE_URL non fourni: pas de teardown, on suppose un tenant deja en place.',
    );
    await teardownTenantBySlug();
  });
});
