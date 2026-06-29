/**
 * Helper Stripe en MODE TEST (sk_test_ uniquement) via l'API REST.
 * Evite d'ajouter une dependance: on parle directement a api.stripe.com.
 * Sert aux parcours 1 et 6 (activation + cycle de vie abonnement, Test Clocks +
 * webhooks signes forges vers /api/webhooks/stripe).
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { journeyEnv } from './env';

const STRIPE_API = 'https://api.stripe.com/v1';

function authHeader(): string {
  return 'Bearer ' + journeyEnv.stripeSecretKey;
}

async function stripePost(
  path: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Stripe ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'GET',
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Stripe GET ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function stripeDelete(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Stripe DELETE ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Cree une Test Clock (horloge simulee) pour faire avancer le temps. */
export async function createTestClock(frozenTimeUnix: number): Promise<string> {
  const clock = await stripePost('/test_helpers/test_clocks', {
    frozen_time: String(frozenTimeUnix),
    name: 'attabl-journey',
  });
  return clock.id as string;
}

/** Fait avancer l'horloge de test (renouvellement, fin d'essai, echec...). */
export async function advanceTestClock(clockId: string, toUnix: number): Promise<void> {
  await stripePost(`/test_helpers/test_clocks/${clockId}/advance`, {
    frozen_time: String(toUnix),
  });
}

/**
 * Supprime une Test Clock (cascade: customers + subscriptions rattaches). A appeler
 * en teardown: Stripe limite le nombre d'horloges de test actives par compte, sinon
 * les runs successifs finissent par echouer a la creation. Best-effort (ne throw pas).
 */
export async function deleteTestClock(clockId: string): Promise<void> {
  try {
    await stripeDelete(`/test_helpers/test_clocks/${clockId}`);
  } catch {
    // Best-effort: un teardown d'horloge qui echoue ne doit pas casser le run.
  }
}

/** Cree un produit + prix mensuel recurrent de test. Retourne l'id du prix. */
export async function createTestPrice(): Promise<string> {
  const product = await stripePost('/products', { name: 'ATTABL Journey Plan' });
  const price = await stripePost('/prices', {
    product: product.id as string,
    unit_amount: '5000',
    currency: 'xof',
    'recurring[interval]': 'month',
  });
  return price.id as string;
}

/**
 * Cree un customer rattache a une Test Clock, attache un moyen de paiement de test
 * et le definit par defaut. `paymentMethod` = 'pm_card_visa' (paie) ou
 * 'pm_card_chargeCustomerFail' (echoue au renouvellement). Retourne l'id customer.
 */
export async function createCustomerOnClock(
  clockId: string,
  opts: { paymentMethod?: string } = {},
): Promise<string> {
  const pmToken = opts.paymentMethod ?? 'pm_card_visa';
  const customer = await stripePost('/customers', {
    test_clock: clockId,
    name: 'attabl-journey',
  });
  const customerId = customer.id as string;
  const pm = await stripePost(`/payment_methods/${pmToken}/attach`, { customer: customerId });
  await stripePost(`/customers/${customerId}`, {
    'invoice_settings[default_payment_method]': pm.id as string,
  });
  return customerId;
}

export interface StripeSubscription {
  id: string;
  status: string;
  raw: Record<string, unknown>;
}

/** Cree un abonnement pour un customer (facture immediatement via le pm par defaut). */
export async function createSubscription(
  customerId: string,
  priceId: string,
): Promise<StripeSubscription> {
  const sub = await stripePost('/subscriptions', {
    customer: customerId,
    'items[0][price]': priceId,
  });
  return { id: sub.id as string, status: sub.status as string, raw: sub };
}

/** Relit un abonnement (statut + periode apres avance d'horloge). */
export async function retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
  const sub = await stripeGet(`/subscriptions/${subscriptionId}`);
  return { id: sub.id as string, status: sub.status as string, raw: sub };
}

/** Annule immediatement un abonnement. */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripeDelete(`/subscriptions/${subscriptionId}`);
}

/**
 * Calcule l'en-tete `stripe-signature` (schema v1) pour un corps brut, comme le
 * fait Stripe. L'app verifie via stripe.webhooks.constructEvent(body, sig, secret).
 */
export function signWebhook(rawBody: string, secret: string, timestampUnix: number): string {
  const signedPayload = `${timestampUnix}.${rawBody}`;
  const sig = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestampUnix},v1=${sig}`;
}

type StripeEvent = Record<string, unknown>;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** checkout.session.completed avec notre tenant_id en metadata. */
export function buildCheckoutCompletedEvent(input: {
  tenantId: string;
  customerId: string;
  subscriptionId: string;
  plan?: string;
  interval?: string;
}): StripeEvent {
  return {
    id: newId('evt'),
    object: 'event',
    type: 'checkout.session.completed',
    created: nowSec(),
    data: {
      object: {
        id: newId('cs'),
        object: 'checkout.session',
        customer: input.customerId,
        subscription: input.subscriptionId,
        metadata: {
          tenant_id: input.tenantId,
          plan: input.plan ?? 'starter',
          billing_interval: input.interval ?? 'monthly',
        },
      },
    },
  };
}

/** customer.subscription.updated portant l'objet abonnement reel (statut/periode). */
export function buildSubscriptionUpdatedEvent(subscription: Record<string, unknown>): StripeEvent {
  return {
    id: newId('evt'),
    object: 'event',
    type: 'customer.subscription.updated',
    created: nowSec(),
    data: { object: subscription },
  };
}

/** invoice.payment_failed pour un customer. */
export function buildInvoicePaymentFailedEvent(input: { customerId: string }): StripeEvent {
  return {
    id: newId('evt'),
    object: 'event',
    type: 'invoice.payment_failed',
    created: nowSec(),
    data: { object: { id: newId('in'), object: 'invoice', customer: input.customerId } },
  };
}

/** customer.subscription.deleted pour un customer. */
export function buildSubscriptionDeletedEvent(input: { customerId: string }): StripeEvent {
  return {
    id: newId('evt'),
    object: 'event',
    type: 'customer.subscription.deleted',
    created: nowSec(),
    data: { object: { id: newId('sub'), object: 'subscription', customer: input.customerId } },
  };
}

/**
 * Poste un event forge et SIGNE vers /api/webhooks/stripe (l'app verifie la
 * signature avec STRIPE_WEBHOOK_SECRET, identique a journeyEnv.stripeWebhookSecret
 * en local). Retourne la reponse Playwright.
 */
export function postWebhookEvent(ctx: APIRequestContext, event: StripeEvent): Promise<APIResponse> {
  const rawBody = JSON.stringify(event);
  const ts = nowSec();
  const signature = signWebhook(rawBody, journeyEnv.stripeWebhookSecret, ts);
  return ctx.post('/api/webhooks/stripe', {
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    data: rawBody,
  });
}

/**
 * Poste un event avec une signature INVALIDE (signe avec un mauvais secret).
 * Sert au test negatif: l'app doit rejeter (400) sans appliquer d'effet de bord.
 */
export function postWebhookEventBadSignature(
  ctx: APIRequestContext,
  event: StripeEvent,
): Promise<APIResponse> {
  const rawBody = JSON.stringify(event);
  const ts = nowSec();
  const signature = signWebhook(rawBody, 'whsec_wrong_secret_attacker', ts);
  return ctx.post('/api/webhooks/stripe', {
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    data: rawBody,
  });
}
