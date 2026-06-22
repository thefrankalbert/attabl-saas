import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { webhookLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyWaveWebhook } from '@/lib/wave/client';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { success: allowed } = await webhookLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-wave-signature') ?? '';

  if (!verifyWaveWebhook(rawBody, signatureHeader)) {
    logger.warn('Wave webhook: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventId = event.id as string | undefined;
  const eventType = event.type as string | undefined;

  if (!eventId || !eventType) {
    return NextResponse.json({ error: 'Missing event id or type' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: insertError } = await supabase.from('wave_events').insert({
    id: eventId,
    type: eventType,
    wave_created_at: (event.when_created as string) ?? null,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ received: true });
    }
    logger.error('Wave webhook: failed to record event', { insertError, eventId });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (eventType === 'checkout.session.completed') {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const orderId = data.client_reference as string | undefined;

    if (orderId) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, tenant_id, total, payment_status, payment_method, wave_checkout_id')
        .eq('id', orderId)
        .single();

      if (!order) {
        logger.warn('Wave webhook: order not found', { orderId, eventId });
        return NextResponse.json({ received: true });
      }

      if (order.payment_method !== 'wave') {
        logger.warn('Wave webhook: payment method mismatch', {
          orderId,
          eventId,
          actualMethod: order.payment_method,
        });
        return NextResponse.json({ received: true });
      }

      // Bind the event to the checkout session we created for this order, so a
      // (validly signed) completion event for a different session cannot mark
      // this order paid.
      const sessionId = data.id as string | undefined;
      const storedCheckoutId = order.wave_checkout_id as string | null;
      if (storedCheckoutId && sessionId !== storedCheckoutId) {
        logger.warn('Wave webhook: checkout session mismatch', {
          orderId,
          eventId,
          actualSession: sessionId,
        });
        return NextResponse.json({ received: true });
      }

      // Payment-integrity: the paid amount must match what was owed, otherwise
      // an underpaid/overpaid session must not flip the order to paid (parity
      // with the Orange Money callback amount check).
      const paidAmount = Math.round(parseFloat((data.amount as string | undefined) ?? 'NaN'));
      const orderTotal = Math.round(Number(order.total));
      if (!Number.isFinite(paidAmount) || paidAmount !== orderTotal) {
        logger.warn('Wave webhook: amount mismatch', {
          orderId,
          eventId,
          expected: orderTotal,
          received: paidAmount,
        });
        return NextResponse.json({ received: true });
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          payment_method: 'wave',
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('tenant_id', order.tenant_id)
        .eq('payment_status', 'pending');

      if (updateError) {
        logger.error('Wave webhook: failed to mark order paid', { updateError, orderId });
      } else {
        logger.info('Wave webhook: order paid', { orderId, eventId });
      }
    }
  }

  return NextResponse.json({ received: true });
}
