import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

const OM_AUTH_URL = 'https://api.orange.com/oauth/v3/token';
const OM_ENV = process.env.ORANGE_MONEY_ENV ?? 'dev';
const OM_PAYMENT_URL = `https://api.orange.com/orange-money-webpay/${OM_ENV}/v1/webpayment`;
const OM_TRANSACTION_STATUS_URL = `https://api.orange.com/orange-money-webpay/${OM_ENV}/v1/transactionstatus`;

function requireOrangeMoneyEnv(): {
  clientId: string;
  clientSecret: string;
  merchantKey: string;
} {
  const clientId = process.env.ORANGE_MONEY_CLIENT_ID;
  const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY;
  if (!clientId) throw new Error('Missing env var: ORANGE_MONEY_CLIENT_ID');
  if (!clientSecret) throw new Error('Missing env var: ORANGE_MONEY_CLIENT_SECRET');
  if (!merchantKey) throw new Error('Missing env var: ORANGE_MONEY_MERCHANT_KEY');
  return { clientId, clientSecret, merchantKey };
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(OM_AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Orange Money auth failed', undefined, { status: response.status, body });
    throw new Error(`Orange Money auth error: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

interface OrangeMoneyPaymentData {
  id: number;
  currency: string;
  order_id: string;
  amount: string;
  payment_url: string;
  pay_token: string;
  notif_token?: string;
}

export async function createOrangeMoneyPayment(params: {
  amount: number;
  currency: string;
  orderId: string;
  notifUrl: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ paymentUrl: string; payToken: string; notifToken: string }> {
  const { clientId, clientSecret, merchantKey } = requireOrangeMoneyEnv();
  const accessToken = await getAccessToken(clientId, clientSecret);

  const response = await fetch(OM_PAYMENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      currency: params.currency,
      order_id: params.orderId,
      amount: String(params.amount),
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      notif_url: params.notifUrl,
      lang: 'fr',
      reference: params.orderId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Orange Money payment creation failed', undefined, {
      status: response.status,
      body,
    });
    throw new Error(`Orange Money API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    status: number;
    message: string;
    notif_token?: string;
    data: OrangeMoneyPaymentData;
  };

  if (data.status !== 201) {
    logger.error('Orange Money payment rejected', undefined, { data });
    throw new Error(`Orange Money payment failed: ${data.message}`);
  }

  const notifToken = data.data.notif_token ?? data.notif_token ?? '';
  if (!notifToken) {
    logger.warn('Orange Money payment missing notif_token', { orderId: params.orderId });
  }

  return {
    paymentUrl: data.data.payment_url,
    payToken: data.data.pay_token,
    notifToken,
  };
}

export interface OrangeMoneyCallbackPayload {
  status: string;
  txnid: string;
  orderId: string;
  amount: string;
  notif_token: string;
  subscriberMsisdn?: string;
  errorcode?: string;
  errormessage?: string;
}

export function verifyOrangeMoneyCallback(body: unknown): body is OrangeMoneyCallbackPayload {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.status === 'string' &&
    typeof b.orderId === 'string' &&
    typeof b.txnid === 'string' &&
    typeof b.amount === 'string' &&
    typeof b.notif_token === 'string'
  );
}

export function verifyOrangeMoneyNotifToken(receivedToken: string, expectedToken: string): boolean {
  if (!receivedToken || !expectedToken) {
    return false;
  }

  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);
  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

export async function getOrangeMoneyTransactionStatus(params: {
  payToken: string;
  orderId: string;
  amount: number;
}): Promise<{ status: string; txnId?: string }> {
  const { clientId, clientSecret, merchantKey } = requireOrangeMoneyEnv();
  const accessToken = await getAccessToken(clientId, clientSecret);

  const response = await fetch(OM_TRANSACTION_STATUS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      order_id: params.orderId,
      amount: String(params.amount),
      pay_token: params.payToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Orange Money transaction status failed', undefined, {
      status: response.status,
      body,
      orderId: params.orderId,
    });
    throw new Error(`Orange Money status error: ${response.status}`);
  }

  const payload = (await response.json()) as {
    status?: number;
    message?: string;
    data?: { status?: string; txn_id?: string; txnid?: string };
  };

  const remoteStatus = payload.data?.status ?? payload.message ?? '';
  const txnId = payload.data?.txn_id ?? payload.data?.txnid;

  return { status: remoteStatus, txnId };
}

/**
 * Optional HMAC verification when ORANGE_MONEY_WEBHOOK_SECRET is configured.
 * Header name: x-orange-signature (hex HMAC-SHA256 of raw body).
 */
export function verifyOrangeMoneyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.ORANGE_MONEY_WEBHOOK_SECRET;
  if (!secret) {
    // No HMAC secret configured: the signature layer cannot run. This is NOT a
    // silent pass anymore - surface the misconfiguration. The payment is still
    // gated by the per-order notif_token match and the out-of-band remote status
    // re-verification, so this alone cannot mark an order paid. Set
    // ORANGE_MONEY_WEBHOOK_SECRET in production to enable strict signature enforcement.
    logger.warn(
      'Orange Money webhook HMAC skipped: ORANGE_MONEY_WEBHOOK_SECRET not configured (payment still gated by notif_token + remote re-check)',
    );
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = signatureHeader
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length || expectedBuf.length === 0) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}
