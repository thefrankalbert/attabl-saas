import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { verifyWaveWebhook } from '@/lib/wave/client';

export async function POST(request: Request) {
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

  // Idempotency: if event id already exists, skip processing
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
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          payment_method: 'wave',
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .neq('payment_status', 'paid');

      if (updateError) {
        logger.error('Wave webhook: failed to mark order paid', { updateError, orderId });
      } else {
        logger.info('Wave webhook: order paid', { orderId, eventId });
      }
    }
  }

  return NextResponse.json({ received: true });
}
