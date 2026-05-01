import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { paymentInitiationLimiter, getClientIp } from '@/lib/rate-limit';
import { createWaveCheckout } from '@/lib/wave/client';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params;

  const ip = getClientIp(request);
  const { success: allowed } = await paymentInitiationLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de requetes' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const tenantSlug = request.headers.get('x-tenant-slug');
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Tenant non identifie' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, enabled_payment_methods, currency')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
  }

  const enabledMethods = (tenant.enabled_payment_methods as string[]) ?? ['cash', 'card'];
  if (!enabledMethods.includes('wave')) {
    return NextResponse.json({ error: 'Wave non active pour ce restaurant' }, { status: 403 });
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, total, payment_status')
    .eq('id', orderId)
    .eq('tenant_id', tenant.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Commande non trouvee' }, { status: 404 });
  }

  if (order.payment_status === 'paid') {
    return NextResponse.json({ error: 'Commande deja payee' }, { status: 409 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { checkoutId, checkoutUrl } = await createWaveCheckout({
      amount: order.total as number,
      currency: (tenant.currency as string) || 'XOF',
      orderId,
      successUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=success`,
      errorUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=error`,
    });

    logger.info('Wave checkout created', { orderId, checkoutId });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    logger.error('Wave checkout creation failed', { err, orderId });
    return NextResponse.json({ error: 'Erreur paiement Wave' }, { status: 502 });
  }
}
