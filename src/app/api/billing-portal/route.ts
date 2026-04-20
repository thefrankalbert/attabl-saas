import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { billingPortalLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await billingPortalLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429 },
      );
    }
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

    // Supabase join type gap
    const tenant = adminUser?.tenants as unknown as {
      stripe_customer_id: string | null;
      slug: string;
    } | null;

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: 'Pas de compte Stripe lié' }, { status: 400 });
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sites/${tenant.slug}/admin/subscription`;

    const customerId = tenant.stripe_customer_id;
    const session = await withStripeBreaker(() =>
      stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      }),
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Billing portal error', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
