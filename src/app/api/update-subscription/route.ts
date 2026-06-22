import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { updateSubscriptionSchema } from '@/lib/validations/checkout.schema';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    // 2. Resolve the ACTIVE tenant from the middleware-injected slug (multi-tenant safe),
    //    then verify the user is an owner/admin of THAT tenant.
    const tenantSlug = request.headers.get('x-tenant-slug');
    if (!tenantSlug) {
      return NextResponse.json({ error: 'Contexte tenant manquant' }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, stripe_subscription_id')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantError || !tenant) {
      logger.error('Update subscription: tenant not found', tenantError, { tenantSlug });
      return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
    }

    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (adminUserError || !adminUser) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    if (adminUser.role !== 'owner' && adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: "Seuls les proprietaires et administrateurs peuvent modifier l'abonnement." },
        { status: 403 },
      );
    }

    if (!tenant.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Aucun abonnement actif. Creez un abonnement via le checkout.' },
        { status: 400 },
      );
    }

    // 3. Validate body with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = updateSubscriptionSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Donnees invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { plan, billingInterval } = parseResult.data;

    // 4. Resolve the Stripe price ID server-side (single source of truth)
    let priceId: string;
    try {
      priceId = getStripePriceId(plan, billingInterval);
    } catch (configError) {
      logger.error('Update subscription: missing Stripe price configuration', configError, {
        plan,
        billingInterval,
      });
      return NextResponse.json(
        { error: 'Configuration de facturation manquante' },
        { status: 500 },
      );
    }

    // 5. Retrieve current subscription and update with proration
    const subscriptionId = tenant.stripe_subscription_id;
    const subscription = await withStripeBreaker(() =>
      stripe.subscriptions.retrieve(subscriptionId),
    );

    if (subscription.status === 'canceled') {
      return NextResponse.json(
        { error: "L'abonnement est annule. Creez un nouvel abonnement via le checkout." },
        { status: 400 },
      );
    }

    const existingItem = subscription.items.data[0];
    if (!existingItem) {
      logger.error('Update subscription: no items found', undefined, {
        subscriptionId,
      });
      return NextResponse.json(
        { error: "Erreur de configuration de l'abonnement" },
        { status: 500 },
      );
    }

    const updatedSubscription = await withStripeBreaker(() =>
      stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: existingItem.id,
            price: priceId,
          },
        ],
        proration_behavior: 'create_prorations',
      }),
    );

    logger.info('Subscription updated successfully', {
      subscriptionId: updatedSubscription.id,
      newPriceId: priceId,
      tenantId: tenant.id,
    });

    return NextResponse.json({
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Subscription update error', error, { message: msg });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
