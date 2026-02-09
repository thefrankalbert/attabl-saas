import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';

/**
 * Checkout schema — simplified since tenantId and email are derived from session.
 * We only need plan and billingInterval from the client.
 */
const checkoutBodySchema = z.object({
  plan: z.enum(['essentiel', 'premium'], {
    error: 'Plan invalide. Choisissez essentiel ou premium.',
  }),
  billingInterval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
});

export async function POST(request: Request) {
  try {
    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
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
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, tenants(name)')
      .eq('user_id', user.id)
      .single();

    if (!adminUser?.tenant_id) {
      return NextResponse.json(
        { error: 'Tenant non trouvé pour cet utilisateur' },
        { status: 404 },
      );
    }

    const tenantId = adminUser.tenant_id;
    const email = user.email!;

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
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email,
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
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: unknown) {
    logger.error('Stripe checkout error', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur Stripe';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
