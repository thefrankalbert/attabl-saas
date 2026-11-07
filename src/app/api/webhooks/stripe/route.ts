import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/stripe/server';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createStripeWebhookService } from '@/services/stripe-webhook.service';

/**
 * Webhook Stripe - controleur fin.
 *
 * Cette route ne porte QUE ce qu'elle seule peut porter:
 *   1. la verification de signature (c'est la seule preuve que l'appel vient
 *      bien de Stripe: elle ne bouge jamais, et rien ne la precede);
 *   2. l'idempotence (INSERT ON CONFLICT DO NOTHING sur `stripe_events`), plus
 *      le RETRAIT de cette ligne quand une ecriture echoue, pour que le rejeu
 *      de Stripe ne soit pas court-circuite en "deja traite";
 *   3. l'aiguillage vers `createStripeWebhookService`;
 *   4. la traduction d'une `ServiceError` en statut HTTP.
 *
 * Toutes les regles d'acces (quel evenement ecrit quoi, depuis quel etat, et ce
 * qu'il ne doit jamais rendre) vivent dans `src/services/stripe-webhook/`.
 */

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
}

export async function POST(request: Request) {
  let stripe: ReturnType<typeof getStripe>;
  let webhookSecret: string;
  try {
    stripe = getStripe();
    webhookSecret = getWebhookSecret();
  } catch (err) {
    logger.error('Stripe webhook env vars missing', err);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Tracks the stripe_events row inserted by THIS request so the outer catch can
  // roll it back if a handler throws - otherwise Stripe's retry would short-circuit
  // as "already processed" and the side effect would be permanently lost.
  let recordedEventId: string | null = null;
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      logger.error('Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Webhook signature verification failed', err, { errorMessage });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Utiliser admin client pour bypass RLS
    const supabase = createAdminClient();

    // Idempotency: short-circuit replayed events. INSERT ON CONFLICT DO NOTHING
    // atomically inserts the event id. If a row is returned, this is the first
    // time we see this event. If null/empty, Stripe is replaying (retries up to
    // 3 days, or manual dashboard resend) - return 200 without re-applying side
    // effects to the tenant state.
    const stripeCreatedAt = event.created ? new Date(event.created * 1000).toISOString() : null;
    const { data: insertedEvent, error: idempotencyError } = await supabase
      .from('stripe_events')
      .insert({
        id: event.id,
        type: event.type,
        stripe_created_at: stripeCreatedAt,
      })
      .select('id')
      .maybeSingle();

    if (idempotencyError && idempotencyError.code !== '23505') {
      logger.error('Failed to record Stripe event for idempotency', idempotencyError, {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!insertedEvent) {
      logger.info('Stripe event already processed, skipping', {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json({ received: true, idempotent: true });
    }

    // This request inserted the idempotency row; remember it for rollback on throw.
    recordedEventId = event.id;

    try {
      await createStripeWebhookService(supabase, stripe).handleEvent(event);
    } catch (err: unknown) {
      if (!(err instanceof ServiceError)) throw err;
      // Le gestionnaire a deja journalise la cause precise. Ce qui reste a faire
      // est propre a la route: retirer la ligne d'idempotence pour que le rejeu
      // de Stripe retraite l'evenement, puis rendre le statut HTTP.
      await supabase.from('stripe_events').delete().eq('id', event.id);
      return NextResponse.json({ error: err.message }, { status: serviceErrorToStatus(err.code) });
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    logger.error('Webhook error', error);
    // Roll back the idempotency record on a thrown failure so Stripe's retry can
    // reprocess (mirrors the explicit ServiceError path). Uses a fresh admin
    // client because the in-try one is out of scope here.
    if (recordedEventId) {
      try {
        await createAdminClient().from('stripe_events').delete().eq('id', recordedEventId);
      } catch (rollbackErr) {
        logger.error('Failed to roll back Stripe idempotency record', rollbackErr, {
          eventId: recordedEventId,
        });
      }
    }
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
