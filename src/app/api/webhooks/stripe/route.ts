import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getPlanFromPriceId, getIntervalFromPriceId } from '@/lib/stripe/server';
import type { BillingInterval, SubscriptionStatus } from '@/types/billing';

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  return new Stripe(key);
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Detect billing interval from Stripe subscription item.
 */
function detectBillingInterval(subscription: Stripe.Subscription): BillingInterval {
  const item = subscription.items?.data?.[0];
  if (!item?.plan) return 'monthly';

  const interval = item.plan.interval;
  const intervalCount = item.plan.interval_count;

  if (interval === 'year') return 'yearly';
  if (interval === 'month' && intervalCount === 6) return 'semiannual';
  return 'monthly';
}

/**
 * Mappe le statut Stripe vers le statut interne du tenant.
 */
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    case 'unpaid':
      return 'past_due';
    default:
      logger.warn('Unknown Stripe status, defaulting to active', { stripeStatus });
      return 'active';
  }
}

export async function POST(request: Request) {
  let stripe: Stripe;
  let webhookSecret: string;
  try {
    stripe = getStripeClient();
    webhookSecret = getWebhookSecret();
  } catch (err) {
    logger.error('Stripe webhook env vars missing', err);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

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

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan;
        const billingInterval = session.metadata?.billing_interval;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (tenantId) {
          // Idempotency: skip if tenant already has this subscription ID
          const { data: existingTenant } = await supabase
            .from('tenants')
            .select('stripe_subscription_id')
            .eq('id', tenantId)
            .single();

          if (existingTenant?.stripe_subscription_id === subscriptionId) {
            logger.info('checkout.session.completed already processed, skipping', {
              tenantId,
              subscriptionId,
            });
            break;
          }

          // Récupérer le vrai statut de l'abonnement Stripe
          let mappedStatus: SubscriptionStatus = 'active';
          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              mappedStatus = mapStripeStatus(subscription.status);
            } catch (err) {
              logger.warn(
                "Impossible de récupérer le statut de l'abonnement, utilisation du statut par défaut",
                {
                  subscriptionId,
                  error: err,
                },
              );
            }
          }

          // Mettre à jour le tenant avec les infos Stripe
          const updateData: Record<string, unknown> = {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: mappedStatus,
          };

          // Ajouter le plan si fourni
          if (plan) {
            updateData.subscription_plan = plan;
          }

          // Ajouter l'intervalle de facturation si fourni
          if (billingInterval) {
            updateData.billing_interval = billingInterval;
          }

          const { error: updateError } = await supabase
            .from('tenants')
            .update(updateData)
            .eq('id', tenantId);

          if (updateError) {
            logger.error('DB update failed for checkout.session.completed', updateError, {
              tenantId,
              subscriptionId,
            });
            return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
          }

          logger.info('Tenant activated via checkout', {
            tenantId,
            plan,
            billingInterval,
            subscriptionStatus: mappedStatus,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Récupérer le tenant
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, subscription_status, subscription_plan, billing_interval')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantError || !tenant) {
          logger.warn('Subscription updated: tenant not found', { customerId });
          break;
        }

        // Accéder aux périodes via les items
        const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start;
        const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end;

        // Mapper le statut Stripe vers le statut interne
        const mappedStatus = mapStripeStatus(subscription.status);

        const updateData: Record<string, unknown> = {
          subscription_status: mappedStatus,
        };

        // Detect plan/interval change via price ID
        const currentPriceId = subscription.items?.data?.[0]?.price?.id;
        if (currentPriceId) {
          const detectedPlan = getPlanFromPriceId(currentPriceId);
          const detectedInterval = getIntervalFromPriceId(currentPriceId);

          if (detectedPlan && detectedPlan !== tenant.subscription_plan) {
            updateData.subscription_plan = detectedPlan;
            logger.info('Plan change detected', {
              tenantId: tenant.id,
              oldPlan: tenant.subscription_plan,
              newPlan: detectedPlan,
            });
          }

          if (detectedInterval && detectedInterval !== tenant.billing_interval) {
            updateData.billing_interval = detectedInterval;
          }
        }

        // Fallback: detect billing interval from Stripe subscription interval
        if (!updateData.billing_interval) {
          const detectedInterval = detectBillingInterval(subscription);
          if (detectedInterval !== tenant.billing_interval) {
            updateData.billing_interval = detectedInterval;
          }
        }

        if (currentPeriodStart) {
          updateData.subscription_current_period_start = new Date(
            currentPeriodStart * 1000,
          ).toISOString();
        }
        if (currentPeriodEnd) {
          updateData.subscription_current_period_end = new Date(
            currentPeriodEnd * 1000,
          ).toISOString();
        }

        const { error: updateError } = await supabase
          .from('tenants')
          .update(updateData)
          .eq('id', tenant.id);

        if (updateError) {
          logger.error('DB update failed for customer.subscription.updated', updateError, {
            tenantId: tenant.id,
            stripeStatus: subscription.status,
          });
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.info('Subscription updated', {
          tenantId: tenant.id,
          stripeStatus: subscription.status,
          mappedStatus,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Geler le tenant
        const { data: tenant, error: tenantDeleteError } = await supabase
          .from('tenants')
          .select('id, subscription_status')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantDeleteError || !tenant) {
          logger.warn('Subscription deleted: tenant not found', { customerId });
          break;
        }

        // Idempotency: skip if tenant is already frozen
        if (tenant.subscription_status === 'frozen') {
          logger.info('customer.subscription.deleted already processed, skipping', {
            tenantId: tenant.id,
          });
          break;
        }

        const { error: updateError } = await supabase
          .from('tenants')
          .update({
            subscription_status: 'frozen',
            is_active: false,
          })
          .eq('id', tenant.id);

        if (updateError) {
          logger.error('DB update failed for customer.subscription.deleted', updateError, {
            tenantId: tenant.id,
          });
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.warn('Tenant frozen - subscription deleted', { tenantId: tenant.id });
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Stripe sends this 3 days before trial ends
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantError || !tenant) {
          logger.warn('Trial will end: tenant not found', { customerId });
          break;
        }

        // Mark trial warning so UI can display urgent banner
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ trial_warning_sent: true })
          .eq('id', tenant.id);

        if (updateError) {
          logger.error('DB update failed for trial_will_end', updateError, {
            tenantId: tenant.id,
          });
          break;
        }

        logger.info('Trial ending soon, warning sent', { tenantId: tenant.id });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Marquer comme "past_due"
        const { data: tenant, error: tenantPaymentError } = await supabase
          .from('tenants')
          .select('id, subscription_status')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantPaymentError || !tenant) {
          logger.warn('Payment failed: tenant not found', { customerId });
          break;
        }

        // Idempotency: skip if tenant is already past_due
        if (tenant.subscription_status === 'past_due') {
          logger.info('invoice.payment_failed already reflects current state, skipping', {
            tenantId: tenant.id,
          });
          break;
        }

        const { error: updateError } = await supabase
          .from('tenants')
          .update({
            subscription_status: 'past_due',
          })
          .eq('id', tenant.id);

        if (updateError) {
          logger.error('DB update failed for invoice.payment_failed', updateError, {
            tenantId: tenant.id,
          });
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.warn('Payment failed for tenant', { tenantId: tenant.id });
        break;
      }

      case 'invoice.payment_action_required': {
        // 3D Secure or other payment action required
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logger.info('Payment action required', {
          customerId,
          invoiceId: invoice.id,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        });
        break;
      }

      default:
        logger.info('Unhandled Stripe event type', { eventType: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    logger.error('Webhook error', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
