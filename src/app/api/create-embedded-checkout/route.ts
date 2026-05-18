import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { logger } from '@/lib/logger';
import { checkoutBodySchema } from '@/lib/validations/checkout.schema';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { resolveCheckoutTenant } from '@/lib/stripe/checkout-tenant';
import { toCheckoutApiError } from '@/lib/stripe/checkout-errors';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

function resolvePriceId(plan: SelfServicePlan, billingInterval: BillingInterval): string {
  try {
    return getStripePriceId(plan, billingInterval);
  } catch (configError) {
    logger.error('Embedded checkout: missing Stripe price configuration', configError, {
      plan,
      billingInterval,
    });
    throw configError;
  }
}

function buildTrialDays(tenantData: {
  subscription_status: string | null;
  trial_ends_at: string | null;
}): number | undefined {
  if (tenantData.subscription_status !== 'trial' || !tenantData.trial_ends_at) {
    return undefined;
  }
  const remaining = Math.ceil(
    (new Date(tenantData.trial_ends_at).getTime() - Date.now()) / 86400000,
  );
  return remaining > 0 ? remaining : undefined;
}

async function createEmbeddedSession(params: {
  priceId: string;
  tenantId: string;
  plan: SelfServicePlan;
  billingInterval: BillingInterval;
  customerId: string | null;
  customerEmail: string;
  trialDays?: number;
}) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://attabl.com');

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    ui_mode: 'embedded',
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: params.priceId, quantity: 1 }],
    metadata: {
      tenant_id: params.tenantId,
      plan: params.plan,
      billing_interval: params.billingInterval,
    },
    return_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    subscription_data: {
      ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
      metadata: {
        tenant_id: params.tenantId,
        plan: params.plan,
        billing_interval: params.billingInterval,
      },
    },
  };

  if (params.customerId) {
    sessionParams.customer = params.customerId;
  } else {
    sessionParams.customer_email = params.customerEmail;
  }

  return withStripeBreaker(() => stripe.checkout.sessions.create(sessionParams));
}

function isMissingStripeCustomer(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === 'resource_missing' &&
    error.param === 'customer'
  );
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const resolved = await resolveCheckoutTenant();
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const tenantData = resolved.tenant.tenants;
    if (tenantData?.stripe_subscription_id) {
      return NextResponse.json(
        {
          error: 'Ce tenant a deja un abonnement actif. Utilisez le changement de plan.',
          code: 'EXISTING_SUBSCRIPTION',
        },
        { status: 409 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = checkoutBodySchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Donnees invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { plan, billingInterval } = parseResult.data;
    const priceId = resolvePriceId(plan, billingInterval);
    const trialDays = tenantData ? buildTrialDays(tenantData) : undefined;
    const existingCustomerId = tenantData?.stripe_customer_id ?? null;

    let session: Stripe.Checkout.Session;
    try {
      session = await createEmbeddedSession({
        priceId,
        tenantId: resolved.tenant.tenant_id,
        plan,
        billingInterval,
        customerId: existingCustomerId,
        customerEmail: resolved.email,
        trialDays,
      });
    } catch (stripeError) {
      if (existingCustomerId && isMissingStripeCustomer(stripeError)) {
        logger.warn('Embedded checkout: stale stripe_customer_id, retrying with email', {
          tenantId: resolved.tenant.tenant_id,
          customerId: existingCustomerId,
        });
        session = await createEmbeddedSession({
          priceId,
          tenantId: resolved.tenant.tenant_id,
          plan,
          billingInterval,
          customerId: null,
          customerEmail: resolved.email,
          trialDays,
        });
      } else {
        throw stripeError;
      }
    }

    if (!session.client_secret) {
      logger.error('Embedded checkout: session created without client_secret', undefined, {
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: 'Session Stripe invalide (client_secret manquant)' },
        { status: 502 },
      );
    }

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error: unknown) {
    logger.error('Stripe embedded checkout error', error);
    const { status, body } = toCheckoutApiError(error);
    return NextResponse.json(body, { status });
  }
}
