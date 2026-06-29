/**
 * Parcours 1: le restaurateur cree son compte et paie son plan.
 * Couvre: signup -> login -> (checkout Stripe en mode test).
 *
 * Runnable des maintenant en local (ALLOW_DEV_AUTH_BYPASS=true -> Turnstile off).
 * La partie facturation ne tourne que si JOURNEY_STRIPE_SECRET_KEY (sk_test_) est
 * fournie.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv, hasStripeTestEnv, hasStripeWebhookEnv, journeyEnv } from './fixtures/env';
import { OWNER, loginPersona, newApiContext } from './fixtures/personas';
import {
  authUserExists,
  ensureAuthUser,
  getTenantBilling,
  seedTenantWithMenu,
  teardownTenantBySlug,
} from './fixtures/seed';
import {
  buildCheckoutCompletedEvent,
  createCustomerOnClock,
  createSubscription,
  createTestClock,
  createTestPrice,
  deleteTestClock,
  postWebhookEvent,
  postWebhookEventBadSignature,
} from './fixtures/stripe';

test.describe.serial('01 - Signup & Billing', () => {
  test('le proprietaire cree son compte (signup)', async () => {
    const ctx = await newApiContext();
    // Payload VALIDE au sens de signupSchema (restaurantName/email/password). En dev
    // (ALLOW_DEV_AUTH_BYPASS) Turnstile + honeypot sont bypasses: un payload valide
    // ne doit PAS renvoyer 400. Seuls 200/201 (cree) ou 409 (deja existant en re-run
    // sur base persistante) sont acceptables. Un 400 ici = signup casse.
    const res = await ctx.post('/api/signup', {
      data: {
        email: OWNER.email,
        password: OWNER.password,
        restaurantName: 'Journey Test Bistro',
        cfToken: 'dev-bypass',
      },
    });
    expect([200, 201, 409], `signup statut ${res.status()} - ${await res.text()}`).toContain(
      res.status(),
    );

    // Verification positive: si le compte vient d'etre cree, l'utilisateur auth doit
    // exister reellement (un 2xx qui ne cree rien serait un faux succes). On ne peut
    // le verifier qu'avec la base de TEST (client service_role).
    if (hasSeedEnv() && [200, 201].includes(res.status())) {
      expect(await authUserExists(OWNER.email!), 'signup 2xx mais user auth absent').toBe(true);
    }
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
  // On forge l'event SIGNE (HMAC avec STRIPE_WEBHOOK_SECRET, identique cote app et
  // cote test en local) en portant notre tenant_id en metadata, adosse a un vrai
  // customer+subscription sur une Test Clock. Pas de process externe (stripe listen).
  test('abonnement actif apres webhook checkout.session.completed', async () => {
    test.skip(
      !hasSeedEnv() || !hasStripeWebhookEnv(),
      'Requiert base de TEST + sk_test_ + JOURNEY_STRIPE_WEBHOOK_SECRET.',
    );
    const slug = `${journeyEnv.tenantSlug}-billing`;
    let clockId = '';
    try {
      const seeded = await seedTenantWithMenu({ slug });

      const now = Math.floor(Date.now() / 1000);
      const priceId = await createTestPrice();
      clockId = await createTestClock(now);
      const customerId = await createCustomerOnClock(clockId);
      const sub = await createSubscription(customerId, priceId);

      const ctx = await newApiContext();
      const event = buildCheckoutCompletedEvent({
        tenantId: seeded.tenantId,
        customerId,
        subscriptionId: sub.id,
        plan: 'starter',
        interval: 'monthly',
      });
      const res = await postWebhookEvent(ctx, event);
      expect(res.status(), await res.text()).toBe(200);
      await ctx.dispose();

      const billing = await getTenantBilling(seeded.tenantId);
      expect(billing?.subscription_status, 'tenant active apres webhook').toBe('active');
      expect(billing?.stripe_customer_id).toBe(customerId);
    } finally {
      // Supprime l'horloge de test (cascade customer/subscription) - Stripe limite
      // le nombre d'horloges actives par compte.
      if (clockId) await deleteTestClock(clockId);
      if (hasSeedEnv()) await teardownTenantBySlug(slug);
    }
  });

  // Propriete de SECURITE du webhook: une signature invalide doit etre REJETEE (400)
  // sans aucun effet de bord. Sans ce test, on ne prouvait que le chemin heureux.
  test('un webhook a signature invalide est rejete sans effet', async () => {
    test.skip(
      !hasSeedEnv() || !hasStripeWebhookEnv(),
      'Requiert base de TEST + sk_test_ + JOURNEY_STRIPE_WEBHOOK_SECRET.',
    );
    const slug = `${journeyEnv.tenantSlug}-badsig`;
    try {
      const seeded = await seedTenantWithMenu({ slug });
      const ctx = await newApiContext();
      // Event qui activerait le tenant SI la signature etait valide - ids Stripe bidon
      // (la requete est rejetee a la verification de signature, avant tout traitement).
      const event = buildCheckoutCompletedEvent({
        tenantId: seeded.tenantId,
        customerId: 'cus_attacker_fake',
        subscriptionId: 'sub_attacker_fake',
        plan: 'business',
        interval: 'monthly',
      });
      const res = await postWebhookEventBadSignature(ctx, event);
      expect(res.status(), `signature invalide doit etre 400, recu ${res.status()}`).toBe(400);
      await ctx.dispose();

      // Aucun effet de bord: le tenant n'est PAS active.
      const billing = await getTenantBilling(seeded.tenantId);
      expect(billing?.subscription_status, 'tenant active malgre signature invalide').not.toBe(
        'active',
      );
      expect(billing?.stripe_customer_id, 'customer pose malgre signature invalide').not.toBe(
        'cus_attacker_fake',
      );
    } finally {
      if (hasSeedEnv()) await teardownTenantBySlug(slug);
    }
  });
});
