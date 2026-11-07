import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Adaptateur Stripe + base pour `classifyExistingSubscription`.
 *
 * Separe de la regle elle-mesure (`existing-subscription.ts`) pour que la regle
 * reste testable sans Stripe ni base.
 */

/**
 * Statut de l'abonnement chez Stripe, ou `null` si Stripe ne le connait plus.
 *
 * Un abonnement supprime cote Stripe repond 404 (`resource_missing`): c'est une
 * reponse LEGITIME ici, pas une panne. La distinguer d'une vraie panne importe:
 * sur une panne on ne doit PAS conclure "mort" et ouvrir une seconde caisse.
 */
export async function retrieveStripeSubscriptionStatus(
  subscriptionId: string,
): Promise<string | null> {
  try {
    const subscription = await withStripeBreaker(() =>
      stripe.subscriptions.retrieve(subscriptionId),
    );
    return subscription.status;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      return null;
    }
    // Panne, cle invalide, disjoncteur ouvert: on ne sait pas. On remonte, et
    // l'appelant refuse la caisse - jamais l'inverse.
    throw err;
  }
}

/**
 * Efface l'identifiant d'abonnement mort qui bloquait le retour du client.
 *
 * Client service_role: la colonne n'est pas inscriptible par le client, et
 * cette ecriture doit aboutir meme si l'utilisateur n'a qu'un acces restreint
 * a son tenant. Cible une colonne unique, jamais le statut: c'est le webhook
 * Stripe qui fait foi pour le statut.
 */
export async function clearStaleSubscriptionId(
  tenantId: string,
  subscriptionId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({ stripe_subscription_id: null })
    .eq('id', tenantId)
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    // Non bloquant: la caisse peut s'ouvrir quand meme, et le webhook
    // `checkout.session.completed` reecrira l'identifiant. Mais on le trace,
    // sinon le blocage reviendrait a la prochaine tentative sans explication.
    logger.error('Echec de l effacement de l abonnement mort', error, {
      tenantId,
      subscriptionId,
    });
    return;
  }

  logger.info('Abonnement mort efface: le client peut reprendre un abonnement', {
    tenantId,
    subscriptionId,
  });
}
