import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { paymentInitiationLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrangeMoneyPayment } from '@/lib/orange-money/client';

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
  if (!enabledMethods.includes('orange_money')) {
    return NextResponse.json(
      { error: 'Orange Money non active pour ce restaurant' },
      { status: 403 },
    );
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
    const { paymentUrl } = await createOrangeMoneyPayment({
      amount: order.total as number,
      currency: (tenant.currency as string) || 'XOF',
      orderId,
      notifUrl: `${appUrl}/api/orange-money/callback`,
      returnUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=success`,
      cancelUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=cancel`,
    });

    // Mark payment method at initiation so the callback can verify it was genuinely initiated
    const { error: methodUpdateError } = await supabase
      .from('orders')
      .update({ payment_method: 'orange_money' })
      .eq('id', orderId)
      .eq('payment_status', 'pending');

    if (methodUpdateError) {
      logger.error('Orange Money: failed to set payment_method', { methodUpdateError, orderId });
      return NextResponse.json({ error: 'Erreur initialisation paiement' }, { status: 500 });
    }

    logger.info('Orange Money payment created', { orderId });
    return NextResponse.json({ paymentUrl });
  } catch (err) {
    logger.error('Orange Money payment creation failed', { err, orderId });
    return NextResponse.json({ error: 'Erreur paiement Orange Money' }, { status: 502 });
  }
}
