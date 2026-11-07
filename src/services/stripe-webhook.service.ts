import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import type { StripeWebhookDeps } from './stripe-webhook/deps';
import { handleCheckoutSessionCompleted } from './stripe-webhook/checkout';
import {
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  handleTrialWillEnd,
} from './stripe-webhook/subscription';
import {
  handleInvoicePaid,
  handleInvoicePaymentActionRequired,
  handleInvoicePaymentFailed,
} from './stripe-webhook/invoice';
import { handleDisputeClosed, handleDisputeCreated } from './stripe-webhook/dispute';
import { handleChargeRefunded } from './stripe-webhook/refund';

/**
 * L'AIGUILLAGE des evenements Stripe, et rien d'autre.
 *
 * La route garde ce qu'elle seule peut faire: verifier la signature, tenir
 * l'idempotence, et traduire une `ServiceError` en statut HTTP. Tout le metier
 * vit dans `./stripe-webhook/`, un fichier par famille d'evenements.
 *
 * Un gestionnaire qui leve `ServiceError('...', 'INTERNAL')` demande a la route
 * de RETIRER la ligne d'idempotence et de renvoyer 500, pour que Stripe rejoue
 * l'evenement a partir d'un etat intact. Un gestionnaire qui revient sans rien
 * ecrire consomme l'evenement (200): c'est le choix volontaire pour toute
 * condition PERMANENTE, qu'un rejeu de trois jours ne corrigerait pas.
 */
export function createStripeWebhookService(supabase: SupabaseClient, stripe: Stripe) {
  const deps: StripeWebhookDeps = { supabase, stripe };

  return {
    async handleEvent(event: Stripe.Event): Promise<void> {
      switch (event.type) {
        case 'checkout.session.completed':
          return handleCheckoutSessionCompleted(deps, event.data.object as Stripe.Checkout.Session);

        case 'customer.subscription.updated':
          return handleSubscriptionUpdated(deps, event.data.object as Stripe.Subscription);

        case 'customer.subscription.deleted':
          return handleSubscriptionDeleted(deps, event.data.object as Stripe.Subscription);

        case 'customer.subscription.trial_will_end':
          return handleTrialWillEnd(deps, event.data.object as Stripe.Subscription);

        case 'invoice.payment_failed':
          return handleInvoicePaymentFailed(deps, event.data.object as Stripe.Invoice);

        case 'invoice.payment_action_required':
          return handleInvoicePaymentActionRequired(event.data.object as Stripe.Invoice);

        case 'charge.dispute.created':
          return handleDisputeCreated(deps, event.data.object as Stripe.Dispute);

        case 'charge.dispute.closed':
          return handleDisputeClosed(deps, event.data.object as Stripe.Dispute);

        case 'charge.refunded':
          return handleChargeRefunded(deps, event.data.object as Stripe.Charge);

        case 'invoice.paid':
          return handleInvoicePaid(deps, event.data.object as Stripe.Invoice);

        default:
          logger.info('Unhandled Stripe event type', { eventType: event.type });
      }
    },
  };
}
