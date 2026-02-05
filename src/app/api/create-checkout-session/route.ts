import { NextResponse } from 'next/server';
import { stripe, getStripePriceId } from '@/lib/stripe/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      plan,
      billingInterval = 'monthly',
      tenantId,
      email
    }: {
      plan: 'essentiel' | 'premium';
      billingInterval?: 'monthly' | 'yearly';
      tenantId: string;
      email: string;
    } = body;

    // Validation
    if (!plan || !tenantId || !email) {
      return NextResponse.json(
        { error: 'Paramètres manquants (plan, tenantId, email requis)' },
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
        plan: plan, // Stocker le plan pour le webhook
        billing_interval: billingInterval,
      },
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      subscription_data: {
        trial_period_days: 14, // Essai gratuit 14 jours
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
