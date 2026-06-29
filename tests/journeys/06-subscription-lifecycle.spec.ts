/**
 * Parcours 6: cycle de vie de l'abonnement dans le TEMPS (Stripe Test Clocks).
 * Renouvellement, echec de paiement, annulation - sans attendre un an.
 *
 * On adosse un vrai customer + subscription a une Test Clock (sk_test_), puis on
 * pilote l'etat applicatif via des webhooks SIGNES et forges vers
 * /api/webhooks/stripe (signature HMAC = STRIPE_WEBHOOK_SECRET, identique cote app
 * et cote test en local). Pas de process externe (stripe listen).
 *
 * Gate: hasStripeWebhookEnv() (sk_test_ + secret de signature) + base de TEST.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { hasSeedEnv, hasStripeTestEnv, hasStripeWebhookEnv, journeyEnv } from './fixtures/env';
import { newApiContext } from './fixtures/personas';
import { getTenantBilling, seedTenantWithMenu, teardownTenantBySlug } from './fixtures/seed';
import {
  advanceTestClock,
  buildCheckoutCompletedEvent,
  buildInvoicePaymentFailedEvent,
  buildSubscriptionDeletedEvent,
  buildSubscriptionUpdatedEvent,
  cancelSubscription,
  createCustomerOnClock,
  createSubscription,
  createTestClock,
  createTestPrice,
  deleteTestClock,
  postWebhookEvent,
  retrieveSubscription,
  type StripeSubscription,
} from './fixtures/stripe';

interface ActiveTenant {
  tenantId: string;
  customerId: string;
  subscriptionId: string;
  clockId: string;
}

function periodEnd(sub: StripeSubscription): number {
  const items = (sub.raw.items as { data?: Array<{ current_period_end?: number }> } | undefined)
    ?.data;
  return items?.[0]?.current_period_end ?? 0;
}

test.describe.serial('06 - Cycle de vie abonnement', () => {
  let priceId = '';

  test.beforeAll(() => {
    test.skip(
      !hasSeedEnv() || !hasStripeWebhookEnv(),
      'Requiert base de TEST + sk_test_ + JOURNEY_STRIPE_WEBHOOK_SECRET.',
    );
  });

  /**
   * Provisionne un tenant ACTIF: clock + customer + subscription reels, puis webhook
   * checkout.session.completed signe -> tenant active et lie au customer Stripe.
   */
  async function activateTenant(ctx: APIRequestContext, slug: string): Promise<ActiveTenant> {
    const seeded = await seedTenantWithMenu({ slug });
    const now = Math.floor(Date.now() / 1000);
    if (!priceId) priceId = await createTestPrice();
    const clockId = await createTestClock(now);
    const customerId = await createCustomerOnClock(clockId);
    const sub = await createSubscription(customerId, priceId);

    const res = await postWebhookEvent(
      ctx,
      buildCheckoutCompletedEvent({
        tenantId: seeded.tenantId,
        customerId,
        subscriptionId: sub.id,
        plan: 'starter',
        interval: 'monthly',
      }),
    );
    expect(res.status(), await res.text()).toBe(200);
    const billing = await getTenantBilling(seeded.tenantId);
    expect(billing?.subscription_status, 'activation prealable').toBe('active');

    return { tenantId: seeded.tenantId, customerId, subscriptionId: sub.id, clockId };
  }

  test('creer une horloge de test et avancer le temps', async () => {
    test.skip(!hasStripeTestEnv(), 'JOURNEY_STRIPE_SECRET_KEY (sk_test_) requis.');
    const now = Math.floor(Date.now() / 1000);
    const clockId = await createTestClock(now);
    try {
      expect(clockId).toMatch(/^clock_/);
      await advanceTestClock(clockId, now + 31 * 24 * 3600);
    } finally {
      await deleteTestClock(clockId);
    }
  });

  test('renouvellement mensuel -> abonnement toujours actif', async () => {
    const slug = `${journeyEnv.tenantSlug}-renew`;
    const ctx = await newApiContext();
    let clockId = '';
    try {
      const t = await activateTenant(ctx, slug);
      clockId = t.clockId;

      // Avance d'un peu plus d'un mois: Stripe genere et paie la facture de
      // renouvellement (pm_card_visa), la periode avance.
      const before = await retrieveSubscription(t.subscriptionId);
      await advanceTestClock(t.clockId, Math.floor(Date.now() / 1000) + 32 * 24 * 3600);

      // L'avance d'horloge est asynchrone cote Stripe: on attend que la periode bouge.
      let after = before;
      for (let i = 0; i < 12; i++) {
        after = await retrieveSubscription(t.subscriptionId);
        if (periodEnd(after) > periodEnd(before) && after.status === 'active') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      expect(after.status, 'abonnement actif apres renouvellement').toBe('active');
      expect(periodEnd(after), 'periode de facturation avancee').toBeGreaterThan(periodEnd(before));

      // Le webhook de renouvellement (subscription.updated) garde le tenant actif.
      const res = await postWebhookEvent(ctx, buildSubscriptionUpdatedEvent(after.raw));
      expect(res.status(), await res.text()).toBe(200);
      const billing = await getTenantBilling(t.tenantId);
      expect(billing?.subscription_status).toBe('active');
    } finally {
      if (clockId) await deleteTestClock(clockId);
      await ctx.dispose();
      if (hasSeedEnv()) await teardownTenantBySlug(slug);
    }
  });

  test('echec de paiement au renouvellement -> abonnement en past_due', async () => {
    const slug = `${journeyEnv.tenantSlug}-pastdue`;
    const ctx = await newApiContext();
    let clockId = '';
    try {
      // Activation normale, puis echec de paiement de renouvellement: Stripe le
      // signale par invoice.payment_failed (event reel du contrat webhook), que l'on
      // forge ici. L'app doit passer le tenant en past_due.
      const t = await activateTenant(ctx, slug);
      clockId = t.clockId;
      const res = await postWebhookEvent(
        ctx,
        buildInvoicePaymentFailedEvent({ customerId: t.customerId }),
      );
      expect(res.status(), await res.text()).toBe(200);
      const billing = await getTenantBilling(t.tenantId);
      expect(billing?.subscription_status, 'past_due apres echec de paiement').toBe('past_due');
    } finally {
      if (clockId) await deleteTestClock(clockId);
      await ctx.dispose();
      if (hasSeedEnv()) await teardownTenantBySlug(slug);
    }
  });

  test('annulation -> acces retire (tenant gele)', async () => {
    const slug = `${journeyEnv.tenantSlug}-cancel`;
    const ctx = await newApiContext();
    let clockId = '';
    try {
      const t = await activateTenant(ctx, slug);
      clockId = t.clockId;
      await cancelSubscription(t.subscriptionId);
      const res = await postWebhookEvent(
        ctx,
        buildSubscriptionDeletedEvent({ customerId: t.customerId }),
      );
      expect(res.status(), await res.text()).toBe(200);
      const billing = await getTenantBilling(t.tenantId);
      expect(billing?.subscription_status, 'tenant gele apres annulation').toBe('frozen');
      expect(billing?.is_active, 'acces retire').toBe(false);
    } finally {
      if (clockId) await deleteTestClock(clockId);
      await ctx.dispose();
      if (hasSeedEnv()) await teardownTenantBySlug(slug);
    }
  });
});
