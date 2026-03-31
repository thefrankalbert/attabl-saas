import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { updateSubscriptionSchema } from '@/lib/validations/checkout.schema';

export async function POST(request: Request) {
  try {
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

    // 2. Derive tenant from session and verify owner/admin role
    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('tenant_id, role, tenants(stripe_subscription_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (adminUserError || !adminUser?.tenant_id) {
      logger.error('Update subscription: tenant not found', adminUserError, { userId: user.id });
      return NextResponse.json(
        { error: 'Tenant non trouve pour cet utilisateur' },
        { status: 404 },
      );
    }

    if (adminUser.role !== 'owner' && adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: "Seuls les proprietaires et administrateurs peuvent modifier l'abonnement." },
        { status: 403 },
      );
    }

    const tenantData = adminUser.tenants as unknown as {
      stripe_subscription_id: string | null;
    } | null;

    if (!tenantData?.stripe_subscription_id) {
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

    const { priceId } = parseResult.data;

    // 4. Retrieve current subscription and update with proration
    const subscription = await stripe.subscriptions.retrieve(tenantData.stripe_subscription_id);

    if (subscription.status === 'canceled') {
      return NextResponse.json(
        { error: "L'abonnement est annule. Creez un nouvel abonnement via le checkout." },
        { status: 400 },
      );
    }

    const existingItem = subscription.items.data[0];
    if (!existingItem) {
      logger.error('Update subscription: no items found', undefined, {
        subscriptionId: tenantData.stripe_subscription_id,
      });
      return NextResponse.json(
        { error: "Erreur de configuration de l'abonnement" },
        { status: 500 },
      );
    }

    const updatedSubscription = await stripe.subscriptions.update(
      tenantData.stripe_subscription_id,
      {
        items: [
          {
            id: existingItem.id,
            price: priceId,
          },
        ],
        proration_behavior: 'create_prorations',
      },
    );

    logger.info('Subscription updated successfully', {
      subscriptionId: updatedSubscription.id,
      newPriceId: priceId,
      tenantId: adminUser.tenant_id,
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
