import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { resolveCheckoutTenant } from '@/lib/billing/checkout-tenant';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { logger } from '@/lib/logger';
import { classifyExistingSubscription } from '@/lib/billing/existing-subscription';
import {
  clearStaleSubscriptionId,
  retrieveStripeSubscriptionStatus,
} from '@/lib/billing/stale-subscription';
import { checkoutBodySchema } from '@/lib/validations/checkout.schema';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { expireOtherOpenCheckouts } from '@/lib/billing/expire-open-checkouts';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // La resolution du restaurant a facturer est partagee avec
    // create-embedded-checkout: elle prenait ici la PLUS ANCIENNE ligne
    // admin_users, donc un proprietaire de plusieurs etablissements se faisait
    // facturer le mauvais. La cible vient du slug injecte par le middleware
    // (verifie ensuite par appartenance + role). Voir checkout-tenant.ts.
    const resolved = await resolveCheckoutTenant({
      tenantSlug: readTenantSlug(request.headers).slug,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        resolved.code ? { error: resolved.error, code: resolved.code } : { error: resolved.error },
        { status: resolved.status },
      );
    }

    const tenantId = resolved.tenant.tenant_id;

    const email = resolved.email;
    const tenantData = resolved.tenant.tenants;

    // B1: un abonnement VIVANT interdit une seconde caisse. Un abonnement MORT,
    // lui, laissait son identifiant en base et bloquait le retour du client
    // (409 ici, 400 dans update-subscription). Meme regle que
    // create-embedded-checkout: src/lib/billing/existing-subscription.ts.
    let verdictAbonnement;
    try {
      verdictAbonnement = await classifyExistingSubscription({
        subscriptionId: tenantData?.stripe_subscription_id,
        status: tenantData?.subscription_status,
        retrieveStripeStatus: retrieveStripeSubscriptionStatus,
      });
    } catch (err) {
      logger.error('Checkout: statut d abonnement Stripe illisible', err, { tenantId });
      return NextResponse.json(
        { error: 'Verification de l abonnement impossible. Reessayez dans un instant.' },
        { status: 503 },
      );
    }

    if (verdictAbonnement.kind === 'live') {
      return NextResponse.json(
        {
          error: 'Ce tenant a deja un abonnement actif. Utilisez le changement de plan.',
          code: 'EXISTING_SUBSCRIPTION',
        },
        { status: 409 },
      );
    }

    if (verdictAbonnement.kind === 'stale') {
      await clearStaleSubscriptionId(tenantId, verdictAbonnement.subscriptionId);
    }

    // NOTE: Rate limiting (line 12-19) prevents rapid concurrent checkout attempts.
    // For additional protection, consider adding a checkout_started_at column to tenants.

    // B1: Reuse existing Stripe customer if available
    const existingCustomerId = tenantData?.stripe_customer_id ?? null;
    const customerParams: { customer: string } | { customer_email: string } = existingCustomerId
      ? { customer: existingCustomerId }
      : { customer_email: email };

    // ✅ Validate body with Zod (replaces manual .includes() checks)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = checkoutBodySchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { plan, billingInterval } = parseResult.data;

    // Obtenir le Price ID Stripe correspondant
    const priceId = getStripePriceId(plan, billingInterval);

    // Déterminer l'URL de base selon l'environnement
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://attabl.com');

    // Compute remaining trial days from DB (prevents trial extension exploit)
    const trialDays = (() => {
      if (tenantData?.subscription_status !== 'trial' || !tenantData?.trial_ends_at)
        return undefined;
      const remaining = Math.ceil(
        (new Date(tenantData.trial_ends_at).getTime() - Date.now()) / 86400000,
      );
      return remaining > 0 ? remaining : undefined;
    })();

    // M-01: une session ouverte plus tot reste payable 24 h. On la ferme avant
    // d'en ouvrir une autre, sinon les deux peuvent etre payees.
    await expireOtherOpenCheckouts(stripe, {
      tenantId,
      customerId: existingCustomerId,
      email,
    });

    // Créer la session Stripe Checkout
    const session = await withStripeBreaker(() =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        ...customerParams,
        metadata: {
          tenant_id: tenantId,
          plan: plan,
          billing_interval: billingInterval,
        },
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/cancel`,
        subscription_data: {
          ...(trialDays ? { trial_period_days: trialDays } : {}),
          metadata: {
            tenant_id: tenantId,
            plan: plan,
            billing_interval: billingInterval,
          },
        },
      }),
    );

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Stripe checkout error', error, { message: msg });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
