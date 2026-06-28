import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { paymentInitiationLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrangeMoneyPayment } from '@/lib/orange-money/client';
import { parseRouteUuid } from '@/lib/validations/common.schema';
import { verifyOrigin } from '@/lib/csrf';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = verifyOrigin(request);
  if (originError) return originError;

  const { id: rawOrderId } = await params;
  const parsedOrderId = parseRouteUuid(rawOrderId);
  if (!parsedOrderId.ok) {
    return NextResponse.json({ error: parsedOrderId.error }, { status: 400 });
  }
  const orderId = parsedOrderId.id;

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
    .is('deleted_at', null)
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
    .select('id, total, payment_status, orange_money_pay_token')
    .eq('id', orderId)
    .eq('tenant_id', tenant.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Commande non trouvee' }, { status: 404 });
  }

  if (order.payment_status === 'paid') {
    return NextResponse.json({ error: 'Commande deja payee' }, { status: 409 });
  }

  if (order.payment_status === 'pending' && order.orange_money_pay_token) {
    return NextResponse.json({ error: 'Paiement deja en cours' }, { status: 409 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { paymentUrl, payToken, notifToken } = await createOrangeMoneyPayment({
      amount: order.total as number,
      currency: (tenant.currency as string) || 'XOF',
      orderId,
      notifUrl: `${appUrl}/api/orange-money/callback`,
      returnUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=success`,
      cancelUrl: `${appUrl}/sites/${tenantSlug}/order-confirmed?orderId=${orderId}&payment=cancel`,
    });

    if (!notifToken) {
      logger.error('Orange Money: missing notif_token from provider', { orderId });
      return NextResponse.json({ error: 'Erreur initialisation paiement' }, { status: 502 });
    }

    const { error: methodUpdateError } = await supabase
      .from('orders')
      .update({
        payment_method: 'orange_money',
        orange_money_pay_token: payToken,
        orange_money_notif_token: notifToken,
        payment_initiated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant.id)
      .eq('payment_status', 'pending')
      .is('orange_money_pay_token', null);

    if (methodUpdateError) {
      logger.error('Orange Money: failed to set payment session', { methodUpdateError, orderId });
      return NextResponse.json({ error: 'Erreur initialisation paiement' }, { status: 500 });
    }

    logger.info('Orange Money payment created', { orderId });
    return NextResponse.json({ paymentUrl });
  } catch (err) {
    logger.error('Orange Money payment creation failed', { err, orderId });
    return NextResponse.json({ error: 'Erreur paiement Orange Money' }, { status: 502 });
  }
}
