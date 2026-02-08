import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID manquant' }, { status: 400 });
    }

    // Récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    const tenantId = session.metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID non trouvé dans la session' }, { status: 400 });
    }

    // Récupérer le slug du tenant
    const supabase = createAdminClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      slug: tenant.slug,
      status: session.payment_status,
    });
  } catch (error: unknown) {
    console.error('Verify checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
