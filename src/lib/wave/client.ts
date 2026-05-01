import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

const WAVE_API_BASE = 'https://api.wave.com/v1';

function requireWaveEnv(): { apiKey: string; webhookSecret: string } {
  const apiKey = process.env.WAVE_API_KEY;
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
  if (!apiKey) throw new Error('Missing env var: WAVE_API_KEY');
  if (!webhookSecret) throw new Error('Missing env var: WAVE_WEBHOOK_SECRET');
  return { apiKey, webhookSecret };
}

export interface WaveCheckoutSession {
  id: string;
  checkout_status: 'pending' | 'processing' | 'complete' | 'failed' | 'expired';
  checkout_ui_url: string;
  client_reference: string;
  amount: string;
  currency: string;
  when_created: string;
  when_expires: string;
  transaction_id?: string;
}

export async function createWaveCheckout(params: {
  amount: number;
  currency: string;
  orderId: string;
  successUrl: string;
  errorUrl: string;
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  const { apiKey } = requireWaveEnv();

  const response = await fetch(`${WAVE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(params.amount),
      currency: params.currency,
      client_reference: params.orderId,
      success_url: params.successUrl,
      error_url: params.errorUrl,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Wave checkout creation failed', undefined, { status: response.status, body });
    throw new Error(`Wave API error: ${response.status}`);
  }

  const data = (await response.json()) as WaveCheckoutSession;
  return { checkoutId: data.id, checkoutUrl: data.checkout_ui_url };
}

export function verifyWaveWebhook(rawBody: string, signatureHeader: string): boolean {
  try {
    const { webhookSecret } = requireWaveEnv();

    // Header format: "t=1234567890,v1=abc123"
    const parts: Record<string, string> = {};
    for (const segment of signatureHeader.split(',')) {
      const eqIdx = segment.indexOf('=');
      if (eqIdx > 0) {
        parts[segment.slice(0, eqIdx)] = segment.slice(eqIdx + 1);
      }
    }

    const timestamp = parts['t'];
    const receivedHmac = parts['v1'];
    if (!timestamp || !receivedHmac) return false;

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const tSeconds = parseInt(timestamp, 10);
    if (isNaN(tSeconds) || Math.abs(Date.now() / 1000 - tSeconds) > 300) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedHmac = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

    const expected = Buffer.from(expectedHmac, 'hex');
    const received = Buffer.from(receivedHmac, 'hex');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export async function refundWavePayment(transactionId: string): Promise<void> {
  const { apiKey } = requireWaveEnv();

  const response = await fetch(`${WAVE_API_BASE}/transactions/${transactionId}/reverse`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Wave refund failed', undefined, { status: response.status, body, transactionId });
    throw new Error(`Wave refund error: ${response.status}`);
  }
}

export async function getWaveCheckoutStatus(checkoutId: string): Promise<WaveCheckoutSession> {
  const { apiKey } = requireWaveEnv();

  const response = await fetch(`${WAVE_API_BASE}/checkout/sessions/${checkoutId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Wave API error: ${response.status}`);
  }

  return response.json() as Promise<WaveCheckoutSession>;
}
