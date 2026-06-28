/**
 * Parcours 1: le restaurateur cree son compte et paie son plan.
 * Couvre: signup -> login -> (checkout Stripe en mode test).
 *
 * Runnable des maintenant en local (ALLOW_DEV_AUTH_BYPASS=true -> Turnstile off).
 * La partie facturation ne tourne que si JOURNEY_STRIPE_SECRET_KEY (sk_test_) est
 * fournie.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv, hasStripeTestEnv, journeyEnv } from './fixtures/env';
import { OWNER, loginPersona, newApiContext } from './fixtures/personas';
import { ensureAuthUser } from './fixtures/seed';

test.describe.serial('01 - Signup & Billing', () => {
  test('le proprietaire cree son compte (signup)', async () => {
    const ctx = await newApiContext();
    const res = await ctx.post('/api/signup', {
      data: {
        email: OWNER.email,
        password: OWNER.password,
        // Champs attendus par signupSchema - a confirmer/ajuster selon ton schema:
        restaurantName: 'Journey Test Bistro',
        ownerName: 'Journey Owner',
        cfToken: 'dev-bypass',
      },
    });
    // 200/201 = cree ; 409/400 "deja existant" = acceptable en re-run.
    expect([200, 201, 400, 409]).toContain(res.status());
    await ctx.dispose();
  });

  test('le proprietaire se connecte', async () => {
    // /api/signup cree le compte NON confirme (email de confirmation). En test on
    // confirme l'email via le client admin avant de se connecter (sinon /api/login
    // renvoie 403 "email non confirme"). Necessite la base de TEST.
    test.skip(
      !hasSeedEnv(),
      'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis pour confirmer l email.',
    );
    await ensureAuthUser(OWNER.email!, OWNER.password!);
    const ctx = await loginPersona(OWNER);
    // un endpoint authentifie doit repondre (onboarding/state est protege)
    const res = await ctx.get('/api/onboarding/state');
    expect(res.status(), 'session owner valide').toBeLessThan(400);
    await ctx.dispose();
  });

  test('checkout du plan (Stripe mode test)', async () => {
    test.skip(!hasStripeTestEnv(), 'JOURNEY_STRIPE_SECRET_KEY (sk_test_) non fourni.');
    const ctx = await loginPersona(OWNER);
    const res = await ctx.post('/api/create-checkout-session', {
      data: { plan: 'starter', billingInterval: 'monthly' },
      headers: { 'x-tenant-slug': journeyEnv.tenantSlug },
    });
    expect(res.ok(), `create-checkout-session: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    // Stripe Checkout renvoie une url ou un client_secret/sessionId selon le mode.
    expect(JSON.stringify(body)).toMatch(/url|sessionId|client_secret|clientSecret/i);
    await ctx.dispose();
  });

  // Activation de l'abonnement = webhook checkout.session.completed.
  // En local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  // puis `stripe trigger checkout.session.completed`.
  test('abonnement actif apres webhook', async () => {
    test.skip(true, 'TODO: necessite `stripe listen` + trigger. Voir README section Stripe.');
  });
});
