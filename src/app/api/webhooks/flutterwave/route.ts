import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getFlutterwaveConfig } from '@/lib/billing/flutterwave/config';
import { buildFlutterwaveBilling } from '@/lib/billing/flutterwave/wiring';
import { webhookPayloadSchema } from '@/lib/billing/flutterwave/schemas';
import { isValidWebhookHash } from '@/lib/billing/flutterwave/webhook-hash';

/**
 * Webhook Flutterwave. Trois garde-fous, dans cet ordre:
 *   1. l'en-tete `verif-hash` doit egaler le secret configure (temps constant);
 *   2. le corps n'est qu'un SIGNAL: la transaction est relue par l'API;
 *   3. l'application est idempotente (voir flutterwave-billing.service).
 *
 * Reponses: 200 pour tout ce qui ne doit PAS etre rejoue (evenement etranger,
 * paiement refuse, doublon); 5xx pour ce qui doit l'etre (API ou base en panne),
 * Flutterwave relancera.
 */
export async function POST(request: Request) {
  const config = getFlutterwaveConfig();
  if (!config) {
    return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
  }

  if (!isValidWebhookHash(request.headers.get('verif-hash'), config.webhookHash)) {
    logger.warn('Flutterwave webhook: verif-hash invalide');
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }
  const parsed = webhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }
  if (parsed.data.event && parsed.data.event !== 'charge.completed') {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const wired = buildFlutterwaveBilling();
    if (!wired) return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });

    const outcome = await wired.billing.processTransaction(parsed.data.data.id);
    if (outcome.kind === 'rejected') {
      logger.warn('Flutterwave webhook: paiement non applique', { reason: outcome.reason });
      return NextResponse.json({ received: true, applied: false });
    }
    return NextResponse.json({ received: true, applied: outcome.kind === 'applied' });
  } catch (error: unknown) {
    logger.error('Flutterwave webhook: traitement en echec', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
