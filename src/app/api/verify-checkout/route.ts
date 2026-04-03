import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { verifyCheckoutQuerySchema } from '@/lib/validations/checkout.schema';
import { verifyCheckoutLimiter, getClientIp } from '@/lib/rate-limit';
import { jsonWithCache } from '@/lib/cache-headers';
import { stripe } from '@/lib/stripe/server';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';

export async function GET(request: Request) {
  try {
    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await verifyCheckoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 1. Validate query params
    const { searchParams } = new URL(request.url);
    const parseResult = verifyCheckoutQuerySchema.safeParse({
      session_id: searchParams.get('session_id'),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Session ID manquant' }, { status: 400 });
    }

    // 2. SECURITY: Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 3. Retrieve Stripe session
    const session = await withStripeBreaker(() =>
      stripe.checkout.sessions.retrieve(parseResult.data.session_id),
    );

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    const tenantId = session.metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID non trouvé dans la session' }, { status: 400 });
    }

    // 4. SECURITY: Verify user owns this tenant
    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (adminUserError || !adminUser) {
      logger.warn('Verify checkout: user tried to access another tenant session', {
        userId: user.id,
        tenantId,
      });
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // 5. Get tenant slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    return jsonWithCache(
      {
        success: true,
        slug: tenant.slug,
        status: session.payment_status,
      },
      'dynamic',
    );
  } catch (error: unknown) {
    logger.error('Verify checkout error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
