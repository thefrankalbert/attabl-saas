import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { verifyCheckoutLimiter, getClientIp } from '@/lib/rate-limit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const querySchema = z.object({
  session_id: z.string().min(1, 'Session ID requis'),
});

export async function GET(request: Request) {
  try {
    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await verifyCheckoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
      );
    }

    // 1. Validate query params
    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse({
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
    const session = await stripe.checkout.sessions.retrieve(parseResult.data.session_id);

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    const tenantId = session.metadata?.tenant_id;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID non trouvé dans la session' }, { status: 400 });
    }

    // 4. SECURITY: Verify user owns this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!adminUser) {
      logger.warn('Verify checkout: user tried to access another tenant session', {
        userId: user.id,
        tenantId,
      });
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // 5. Get tenant slug
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
    logger.error('Verify checkout error', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
