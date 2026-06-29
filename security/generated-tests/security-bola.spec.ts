/**
 * Test BOLA (Broken Object Level Authorization) - TEMPLATE NON INTRUSIF.
 *
 * Placé volontairement dans security/generated-tests/ pour ne PAS être ramassé
 * par la config Playwright (qui scanne tests/). Il ne s'exécute donc pas en CI
 * tant que tu ne l'as pas déplacé et adapté. Objectif: prouver qu'un membre du
 * tenant A ne peut pas lire/modifier les ressources du tenant B.
 *
 * Pour l'activer:
 *   1. Déplacer vers tests/e2e/security-bola.spec.ts
 *   2. Renseigner deux comptes de test (tenant A et tenant B) + leurs slugs
 *   3. Renseigner des IDs réels appartenant au tenant B
 *   4. pnpm test:e2e tests/e2e/security-bola.spec.ts
 *      (en dev, ALLOW_DEV_AUTH_BYPASS=true desactive Turnstile, donc /api/login
 *      accepte juste email+password - pas de cfToken a fournir)
 *
 * Le test PASSE si chaque acces cross-tenant est refuse (401/403/404) et ne
 * renvoie jamais les donnees du tenant B.
 *
 * NOTE sur les statuts: les routes de paiement (pay-wave, pay-orange-money) et
 * les routes invitations retournent 404/403 sur un id d'un autre tenant. Les
 * routes orders/claim et assignments DELETE filtrent la mutation par
 * .eq('tenant_id', <tenant derive de la session>): un id cross-tenant ne touche
 * AUCUNE ligne (no-op) et peut renvoyer 200 - c'est BOLA-safe (zero acces aux
 * donnees de B) meme si le statut n'est pas dans {401,403,404}. La preuve
 * canonique est la requete SQL ci-dessous, executee en direct sur la prod le
 * 2026-06-28 avec de vrais ids cross-tenant (voir security/AUDIT-EXECUTION-REPORT.md):
 *
 *   -- predicat exact que les routes orders executent
 *   select count(*) from orders o
 *   where o.id = '<order_du_tenant_B>' and o.tenant_id = '<tenant_A>';  -- => 0
 *
 * Resultat live: A voit l'order de B = 0, B voit l'order de A = 0, chacun voit
 * le sien = 1. Isolation cross-tenant confirmee sur la base deployee.
 */
import { test, expect, request } from '@playwright/test';

// === À RENSEIGNER ===
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const TENANT_A = {
  slug: 'tenant-a-slug',
  email: 'owner-a@example.com',
  password: 'CHANGE_ME',
};
const TENANT_B = {
  slug: 'tenant-b-slug',
  // Des IDs réels appartenant au tenant B, à voler depuis le compte A:
  orderId: '00000000-0000-0000-0000-000000000000',
  invitationId: '00000000-0000-0000-0000-000000000000',
  assignmentId: '00000000-0000-0000-0000-000000000000',
};

// Routes dynamiques sensibles relevées dans src/app/api (à compléter):
const CROSS_TENANT_ATTEMPTS: Array<{ method: 'GET' | 'POST' | 'DELETE'; path: string }> = [
  { method: 'POST', path: `/api/orders/${TENANT_B.orderId}/claim` },
  { method: 'POST', path: `/api/orders/${TENANT_B.orderId}/pay-wave` },
  { method: 'POST', path: `/api/orders/${TENANT_B.orderId}/pay-orange-money` },
  { method: 'DELETE', path: `/api/assignments/${TENANT_B.assignmentId}` },
  { method: 'DELETE', path: `/api/invitations/${TENANT_B.invitationId}` },
  { method: 'POST', path: `/api/invitations/${TENANT_B.invitationId}/resend` },
];

async function loginAsTenantA() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  // Adapter à ton flux d'auth réel (route /api/login ou Supabase auth helper).
  const res = await ctx.post('/api/login', {
    data: { email: TENANT_A.email, password: TENANT_A.password },
    headers: { 'x-tenant-slug': TENANT_A.slug },
  });
  expect(res.ok(), 'login tenant A doit réussir').toBeTruthy();
  return ctx; // contexte porteur de la session A (cookies)
}

test.describe('BOLA - isolation cross-tenant', () => {
  test('un membre du tenant A ne peut pas atteindre les ressources du tenant B', async () => {
    const ctxA = await loginAsTenantA();

    for (const attempt of CROSS_TENANT_ATTEMPTS) {
      // On envoie le slug du tenant A (l'attaquant) mais un ID du tenant B.
      const res = await ctxA.fetch(attempt.path, {
        method: attempt.method,
        headers: { 'x-tenant-slug': TENANT_A.slug },
      });
      expect(
        [401, 403, 404].includes(res.status()),
        `${attempt.method} ${attempt.path} doit être refusé (401/403/404), reçu ${res.status()}`,
      ).toBeTruthy();
    }

    await ctxA.dispose();
  });
});
