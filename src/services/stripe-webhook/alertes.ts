import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import type { StripeWebhookDeps } from './deps';

/**
 * Les evenements d'ALERTE (audit E11): ils demandent une action humaine, pas
 * une ecriture sur l'acces du restaurant.
 *
 * Trace durable: la ligne de `stripe_events` (type et identifiant de
 * l'evenement), que la route garde une fois l'evenement abouti. Alerte:
 * `logger.error`, qui part dans Sentry en production, avec l'identifiant du
 * restaurant quand on peut le retrouver. Comme les autres gestionnaires, ces
 * deux-la consomment l'evenement (200) meme si la recherche du restaurant
 * echoue: un rejeu de trois jours ne rendrait pas l'alerte plus utile, et un
 * taux d'echec durable ferait desactiver l'endpoint par Stripe.
 */

type TenantLookup = { tenantId: string | null; tenantLookupFailed?: true };

/** Le restaurant d'un client Stripe, sans jamais lever (l'alerte part quand meme). */
async function tenantDuClient(
  supabase: StripeWebhookDeps['supabase'],
  customerId: string | null,
): Promise<TenantLookup> {
  if (!customerId) return { tenantId: null };
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle<{ id: string }>();
  if (error) return { tenantId: null, tenantLookupFailed: true };
  return { tenantId: data?.id ?? null };
}

function identifiant(valeur: unknown): string | null {
  if (typeof valeur === 'string') return valeur;
  if (valeur && typeof valeur === 'object' && 'id' in valeur) return String(valeur.id);
  return null;
}

/**
 * `invoice.finalization_failed`: une facture BROUILLON n'a pas pu etre
 * finalisee (voir `last_finalization_error`). Aucun paiement n'a ete tente,
 * donc aucun `invoice.payment_failed` ne suivra pour cette facture.
 *
 * AUCUNE ecriture sur le restaurant, volontairement. `past_due` est reserve a
 * un impaye reel (invoice.payment_failed); l'ecrire ici ferait geler par le
 * cron, au bout du delai de grace, un restaurant a qui rien n'a ete demande,
 * pour une erreur de configuration cote ATTABL ou Stripe (taxe, adresse). Si
 * l'abonnement change d'etat chez Stripe, `customer.subscription.updated` le
 * porte deja. Ce qu'il faut ici: que quelqu'un corrige la facture.
 */
export async function handleInvoiceFinalizationFailed(
  { supabase }: StripeWebhookDeps,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = identifiant(invoice.customer);
  const { tenantId, tenantLookupFailed } = await tenantDuClient(supabase, customerId);
  const erreur = invoice.last_finalization_error;
  logger.error('Stripe: facture impossible a finaliser, action manuelle requise', undefined, {
    tenantId,
    ...(tenantLookupFailed ? { tenantLookupFailed } : {}),
    customerId,
    invoiceId: invoice.id,
    billingReason: invoice.billing_reason,
    subscriptionId: identifiant(invoice.parent?.subscription_details?.subscription),
    // Code et type seulement: le message libre peut citer des donnees du client.
    finalizationErrorCode: erreur?.code ?? null,
    finalizationErrorType: erreur?.type ?? null,
  });
}

/**
 * `radar.early_fraud_warning.created`: l'emetteur de la carte signale un
 * paiement possiblement frauduleux. C'est souvent l'annonce d'un litige.
 *
 * AUCUN gel automatique. Un avertissement n'est pas une perte: geler un
 * restaurant qui a peut-etre paye avec sa propre carte serait une sanction
 * sans preuve. Si l'emetteur ouvre un litige, `charge.dispute.created` gele
 * deja. La decision utile (rembourser pour eviter le litige quand
 * `actionable` est vrai) est humaine: on alerte avec ce qu'il faut pour la
 * prendre.
 */
export async function handleEarlyFraudWarningCreated(
  { supabase, stripe }: StripeWebhookDeps,
  warning: Stripe.Radar.EarlyFraudWarning,
): Promise<void> {
  const chargeId = identifiant(warning.charge);
  let customerId: string | null =
    typeof warning.charge === 'object' && warning.charge !== null
      ? identifiant(warning.charge.customer)
      : null;
  let chargeUnreadable = false;
  if (!customerId && chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      customerId = identifiant(charge.customer);
    } catch (err) {
      chargeUnreadable = true;
      logger.warn('radar.early_fraud_warning: paiement illisible chez Stripe', {
        chargeId,
        raison: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const { tenantId, tenantLookupFailed } = await tenantDuClient(supabase, customerId);
  logger.error(
    'Stripe: avertissement de fraude sur un paiement, decision manuelle requise',
    undefined,
    {
      tenantId,
      ...(tenantLookupFailed ? { tenantLookupFailed } : {}),
      ...(chargeUnreadable ? { chargeUnreadable } : {}),
      customerId,
      earlyFraudWarningId: warning.id,
      chargeId,
      paymentIntentId: identifiant(warning.payment_intent),
      fraudType: warning.fraud_type,
      // Vrai tant qu'aucun litige n'est ouvert et que le paiement n'est pas
      // rembourse en entier: un remboursement peut encore eviter le litige.
      actionable: warning.actionable,
      livemode: warning.livemode,
    },
  );
}
