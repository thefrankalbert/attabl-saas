import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { webhookLimiter, getClientIp } from '@/lib/rate-limit';
import {
  getOrangeMoneyTransactionStatus,
  verifyOrangeMoneyCallback,
  verifyOrangeMoneyNotifToken,
  verifyOrangeMoneyWebhookSignature,
} from '@/lib/orange-money/client';

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
  const signatureHeader = request.headers.get('x-orange-signature');

  if (!verifyOrangeMoneyWebhookSignature(rawBody, signatureHeader)) {
    logger.warn('Orange Money callback: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!verifyOrangeMoneyCallback(body)) {
    logger.warn('Orange Money callback: invalid payload structure');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { status, orderId, txnid, amount, notif_token: notifToken } = body;

  const supabase = createAdminClient();

  if (status !== 'SUCCESS') {
    logger.info('Orange Money callback: non-success status, ignoring', { status, txnid, orderId });
    return NextResponse.json({ received: true });
  }

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, total, payment_status, payment_method, orange_money_pay_token, orange_money_notif_token',
    )
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

  const storedNotifToken = order.orange_money_notif_token as string | null;
  if (!storedNotifToken || !verifyOrangeMoneyNotifToken(notifToken, storedNotifToken)) {
    logger.warn('Orange Money callback: notif_token mismatch', { orderId, txnid });
    return NextResponse.json({ error: 'Invalid notification token' }, { status: 401 });
  }

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

  const payToken = order.orange_money_pay_token as string | null;
  if (!payToken) {
    logger.warn('Orange Money callback: missing pay_token on order', { orderId, txnid });
    return NextResponse.json({ error: 'Payment session not found' }, { status: 400 });
  }

  try {
    const remoteStatus = await getOrangeMoneyTransactionStatus({
      payToken,
      orderId,
      amount: orderTotal,
    });

    if (remoteStatus.status.toUpperCase() !== 'SUCCESS') {
      logger.warn('Orange Money callback: remote status not successful', {
        orderId,
        txnid,
        remoteStatus: remoteStatus.status,
      });
      return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 });
    }
  } catch (err) {
    logger.error('Orange Money callback: status verification failed', { err, orderId, txnid });
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 502 });
  }

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
    .eq('id', orderId)
    .eq('payment_status', 'pending');

  if (updateError) {
    logger.error('Orange Money callback: failed to mark order paid', { updateError, orderId });
  } else {
    logger.info('Orange Money callback: order paid', { orderId, txnid });
  }

  return NextResponse.json({ received: true });
}
