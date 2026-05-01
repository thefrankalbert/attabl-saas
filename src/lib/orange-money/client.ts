import { logger } from '@/lib/logger';

const OM_AUTH_URL = 'https://api.orange.com/oauth/v3/token';
const OM_ENV = process.env.ORANGE_MONEY_ENV ?? 'dev';
const OM_PAYMENT_URL = `https://api.orange.com/orange-money-webpay/${OM_ENV}/v1/webpayment`;

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

export interface OrangeMoneyPaymentData {
  id: number;
  currency: string;
  order_id: string;
  amount: string;
  payment_url: string;
  pay_token: string;
}

export async function createOrangeMoneyPayment(params: {
  amount: number;
  currency: string;
  orderId: string;
  notifUrl: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ paymentUrl: string; payToken: string }> {
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
    data: OrangeMoneyPaymentData;
  };

  if (data.status !== 201) {
    logger.error('Orange Money payment rejected', undefined, { data });
    throw new Error(`Orange Money payment failed: ${data.message}`);
  }

  return {
    paymentUrl: data.data.payment_url,
    payToken: data.data.pay_token,
  };
}

export interface OrangeMoneyCallbackPayload {
  status: string;
  txnid: string;
  orderId: string;
  amount: string;
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
    typeof b.amount === 'string'
  );
}
