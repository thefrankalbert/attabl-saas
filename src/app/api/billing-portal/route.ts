import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Get tenant's stripe_customer_id
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, tenants(stripe_customer_id, slug)')
      .eq('user_id', user.id)
      .single();

    const tenant = adminUser?.tenants as unknown as {
      stripe_customer_id: string | null;
      slug: string;
    } | null;

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: 'Pas de compte Stripe lié' }, { status: 400 });
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sites/${tenant.slug}/admin/subscription`;

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Billing portal error', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
