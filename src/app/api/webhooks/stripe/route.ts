import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Mappe le statut Stripe vers le statut interne du tenant.
 */
function mapStripeStatus(stripeStatus: string): 'trial' | 'active' | 'past_due' | 'cancelled' {
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
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature')!;

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

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan as 'essentiel' | 'premium' | undefined;
        const billingInterval = session.metadata?.billing_interval as
          | 'monthly'
          | 'yearly'
          | undefined;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (tenantId) {
          // Récupérer le vrai statut de l'abonnement Stripe
          let mappedStatus: 'trial' | 'active' | 'past_due' | 'cancelled' = 'active';
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

          await supabase.from('tenants').update(updateData).eq('id', tenantId);

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
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantError || !tenant) {
          logger.warn('Subscription updated: tenant not found', { customerId });
          break;
        }

        if (tenant) {
          // Accéder aux périodes via les items
          const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start;
          const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end;

          // Mapper le statut Stripe vers le statut interne
          const mappedStatus = mapStripeStatus(subscription.status);

          const updateData: Record<string, unknown> = {
            subscription_status: mappedStatus,
          };

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

          await supabase.from('tenants').update(updateData).eq('id', tenant.id);

          logger.info('Subscription updated', {
            tenantId: tenant.id,
            stripeStatus: subscription.status,
            mappedStatus,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Suspendre le tenant
        const { data: tenant, error: tenantDeleteError } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantDeleteError || !tenant) {
          logger.warn('Subscription deleted: tenant not found', { customerId });
          break;
        }

        await supabase
          .from('tenants')
          .update({
            subscription_status: 'cancelled',
            is_active: false,
          })
          .eq('id', tenant.id);

        logger.warn('Tenant suspended — subscription cancelled', { tenantId: tenant.id });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Marquer comme "past_due"
        const { data: tenant, error: tenantPaymentError } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantPaymentError || !tenant) {
          logger.warn('Payment failed: tenant not found', { customerId });
          break;
        }

        await supabase
          .from('tenants')
          .update({
            subscription_status: 'past_due',
          })
          .eq('id', tenant.id);

        logger.warn('Payment failed for tenant', { tenantId: tenant.id });
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
