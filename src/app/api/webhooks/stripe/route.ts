import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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
      console.error('Webhook signature verification failed:', errorMessage);
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
          // Mettre à jour le tenant avec les infos Stripe
          const updateData: Record<string, unknown> = {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: 'trial', // Mode trial pendant 14 jours
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

          console.log(
            `✅ Tenant ${tenantId} activé avec succès (Plan: ${plan}, Interval: ${billingInterval})`,
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Récupérer le tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant) {
          // Accéder aux périodes via les items
          const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start;
          const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end;

          const updateData: Record<string, unknown> = {
            subscription_status: subscription.status,
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

          console.log(`✅ Subscription updated for tenant ${tenant.id}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Suspendre le tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant) {
          await supabase
            .from('tenants')
            .update({
              subscription_status: 'cancelled',
              is_active: false,
            })
            .eq('id', tenant.id);

          console.log(`❌ Tenant ${tenant.id} suspendu (abonnement annulé)`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Marquer comme "past_due"
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant) {
          await supabase
            .from('tenants')
            .update({
              subscription_status: 'past_due',
            })
            .eq('id', tenant.id);

          console.log(`⚠️ Payment failed for tenant ${tenant.id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
