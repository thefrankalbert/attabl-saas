import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // ✅ SECURITY FIX: Get user from server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // ✅ SECURITY FIX: Derive tenantId from authenticated user
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, tenants(name)')
      .eq('user_id', user.id)
      .single();

    if (!adminUser?.tenant_id) {
      return NextResponse.json(
        { error: 'Tenant non trouvé pour cet utilisateur' },
        { status: 404 }
      );
    }

    const tenantId = adminUser.tenant_id;
    const email = user.email!;

    const body = await request.json();
    const {
      plan,
      billingInterval = 'monthly',
    }: {
      plan: 'essentiel' | 'premium';
      billingInterval?: 'monthly' | 'yearly';
    } = body;

    // Validation
    if (!plan) {
      return NextResponse.json(
        { error: 'Paramètre manquant (plan requis)' },
        { status: 400 }
      );
    }

    if (!['essentiel', 'premium'].includes(plan)) {
      return NextResponse.json(
        { error: 'Plan invalide. Doit être "essentiel" ou "premium"' },
        { status: 400 }
      );
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return NextResponse.json(
        { error: 'Intervalle invalide. Doit être "monthly" ou "yearly"' },
        { status: 400 }
      );
    }

    // Obtenir le Price ID Stripe correspondant
    const priceId = getStripePriceId(plan, billingInterval);

    // Déterminer l'URL de base selon l'environnement
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'https://attabl.com');

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
    console.error('Stripe checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur Stripe';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

