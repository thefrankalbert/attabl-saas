/**
 * Parcours 3: l'equipe se connecte, et les permissions tiennent.
 * Le coeur de la securite multi-tenant: un non-proprietaire ne doit pas atteindre
 * les actions super_admin / plateforme.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv } from './fixtures/env';
import { RESTAURANT_TEAM, newApiContext } from './fixtures/personas';
import { ensureAuthUser } from './fixtures/seed';

test.describe.serial('03 - Equipe & permissions', () => {
  // Reel SANS seed: une action sensible doit refuser un appelant non autorise.
  test('une route sensible refuse un appel non authentifie', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/admin/reset', { data: {} });
    expect([401, 403, 400, 404]).toContain(res.status());
    expect(res.status(), 'ne doit jamais reussir sans droits').not.toBe(200);
    await ctx.dispose();
  });

  test('provisionner les comptes staff', async () => {
    test.skip(!hasSeedEnv(), 'Base de test requise pour creer les comptes staff.');
    for (const p of RESTAURANT_TEAM.filter((x) => x.role !== 'owner')) {
      await ensureAuthUser(p.email!, p.password!);
    }
    // TODO: rattacher chaque user au tenant via invitations/accept avec son rôle,
    // puis verifier que chacun ne voit que ce que son rôle autorise.
  });

  test('un manager ne peut pas faire une action super_admin', async () => {
    test.skip(
      true,
      'TODO: apres rattachement des rôles, se connecter en manager et asserter le refus (403) sur une action super_admin.',
    );
  });
});
