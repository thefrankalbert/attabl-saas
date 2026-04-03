import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutBodySchema } from '@/lib/validations/checkout.schema';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';

export async function POST(request: Request) {
  try {
    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();

    // ✅ SECURITY: Get user from server-side auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // ✅ SECURITY: Derive tenantId from authenticated user
    // Use maybeSingle() instead of single() to handle super_admin users
    // who may have multiple admin_users entries across tenants
    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('tenant_id, tenants(name, stripe_customer_id, stripe_subscription_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (adminUserError || !adminUser?.tenant_id) {
      logger.error('Checkout: tenant not found for user', adminUserError, { userId: user.id });
      return NextResponse.json(
        { error: 'Tenant non trouve pour cet utilisateur' },
        { status: 404 },
      );
    }

    const tenantId = adminUser.tenant_id;

    if (!user.email) {
      logger.error('Checkout: user has no email', undefined, { userId: user.id });
      return NextResponse.json(
        { error: 'Aucune adresse email associee a ce compte' },
        { status: 400 },
      );
    }

    const email = user.email;
    // Supabase join type gap
    const tenantData = adminUser.tenants as unknown as {
      name: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    } | null;

    // B1: If tenant already has an active subscription, reject and direct to update endpoint
    if (tenantData?.stripe_subscription_id) {
      return NextResponse.json(
        {
          error: 'Ce tenant a deja un abonnement actif. Utilisez le changement de plan.',
          code: 'EXISTING_SUBSCRIPTION',
        },
        { status: 409 },
      );
    }

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
          trial_period_days: 14,
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
