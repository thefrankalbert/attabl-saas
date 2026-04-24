import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutBodySchema } from '@/lib/validations/checkout.schema';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';

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

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select(
        'tenant_id, tenants(name, stripe_customer_id, stripe_subscription_id, trial_ends_at, subscription_status)',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (adminUserError || !adminUser?.tenant_id) {
      logger.error('Embedded checkout: tenant not found for user', adminUserError, {
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Tenant non trouve pour cet utilisateur' },
        { status: 404 },
      );
    }

    const tenantId = adminUser.tenant_id;

    if (!user.email) {
      return NextResponse.json(
        { error: 'Aucune adresse email associee a ce compte' },
        { status: 400 },
      );
    }

    const tenantData = adminUser.tenants as unknown as {
      name: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      trial_ends_at: string | null;
      subscription_status: string | null;
    } | null;

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
    const priceId = getStripePriceId(plan, billingInterval);

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://attabl.com');

    const trialDays = (() => {
      if (tenantData?.subscription_status !== 'trial' || !tenantData?.trial_ends_at)
        return undefined;
      const remaining = Math.ceil(
        (new Date(tenantData.trial_ends_at).getTime() - Date.now()) / 86400000,
      );
      return remaining > 0 ? remaining : undefined;
    })();

    const existingCustomerId = tenantData?.stripe_customer_id ?? null;
    const customerParams: { customer: string } | { customer_email: string } = existingCustomerId
      ? { customer: existingCustomerId }
      : { customer_email: user.email };

    const session = await withStripeBreaker(() =>
      stripe.checkout.sessions.create({
        ui_mode: 'embedded',
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        ...customerParams,
        metadata: {
          tenant_id: tenantId,
          plan,
          billing_interval: billingInterval,
        },
        return_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        subscription_data: {
          ...(trialDays ? { trial_period_days: trialDays } : {}),
          metadata: {
            tenant_id: tenantId,
            plan,
            billing_interval: billingInterval,
          },
        },
      }),
    );

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Stripe embedded checkout error', error, { message: msg });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
