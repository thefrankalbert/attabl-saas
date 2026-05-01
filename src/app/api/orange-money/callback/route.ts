import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { verifyOrangeMoneyCallback } from '@/lib/orange-money/client';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!verifyOrangeMoneyCallback(body)) {
    logger.warn('Orange Money callback: invalid payload structure');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { status, orderId, txnid, amount } = body;

  const supabase = createAdminClient();

  if (status !== 'SUCCESS') {
    logger.info('Orange Money callback: non-success status, ignoring', { status, txnid, orderId });
    return NextResponse.json({ received: true });
  }

  // Verify order exists and was genuinely initiated via Orange Money
  const { data: order } = await supabase
    .from('orders')
    .select('id, total, payment_status, payment_method')
    .eq('id', orderId)
    .single();

  if (!order) {
    logger.warn('Orange Money callback: order not found', { orderId, txnid });
    return NextResponse.json({ error: 'Order not found' }, { status: 400 });
  }

  if (order.payment_method !== 'orange_money') {
    logger.warn(
      'Orange Money callback: payment method mismatch - OM not initiated for this order',
      {
        orderId,
        txnid,
        actualMethod: order.payment_method,
      },
    );
    return NextResponse.json({ error: 'Payment method mismatch' }, { status: 400 });
  }

  // Verify amount matches (anti-manipulation)
  const callbackAmount = Math.round(parseFloat(amount));
  const orderTotal = Math.round(Number(order.total));
  if (callbackAmount !== orderTotal) {
    logger.warn('Orange Money callback: amount mismatch', {
      orderId,
      txnid,
      expected: orderTotal,
      received: callbackAmount,
    });
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // Idempotency: only record SUCCESS events to avoid blocking retries of failed transactions
  const { error: insertError } = await supabase.from('orange_money_events').insert({
    id: txnid,
    status,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ received: true });
    }
    logger.error('Orange Money callback: failed to record event', { insertError, txnid });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_method: 'orange_money',
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    logger.error('Orange Money callback: failed to mark order paid', { updateError, orderId });
  } else {
    logger.info('Orange Money callback: order paid', { orderId, txnid });
  }

  return NextResponse.json({ received: true });
}
