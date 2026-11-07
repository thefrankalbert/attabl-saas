import { isSubscriptionUsable } from '@/lib/plans/features';
import type { SubscriptionStatus } from '@/types/billing';

/**
 * Un client resilie peut-il reprendre un abonnement ?
 *
 * LE PIEGE QUE CE FICHIER FERME. `tenants.stripe_subscription_id` n'est JAMAIS
 * remis a null quand un abonnement meurt. Les deux routes se renvoyaient donc
 * la balle, indefiniment:
 *
 *   create-embedded-checkout : id present  -> 409 "Utilisez le changement de plan"
 *   update-subscription      : sub annulee -> 400 "Creez un nouvel abonnement
 *                                                  via le checkout"
 *
 * Un client qui voulait revenir - donc payer - n'avait aucun chemin. C'est un
 * defaut de REVENU, pas un defaut d'affichage.
 *
 * POURQUOI NE PAS SIMPLEMENT AUTORISER LA CAISSE QUAND LE STATUT LOCAL N'EST
 * PAS UTILISABLE. Parce que `unpaid` et `paused` gardent un abonnement VIVANT
 * chez Stripe: ouvrir une seconde caisse la-dessus cree un second abonnement
 * et le client est factures DEUX FOIS. La colonne locale ne suffit pas a
 * decider; seul Stripe sait si l'abonnement est mort.
 *
 * D'ou l'ordre: statut local utilisable -> on refuse sans appeler Stripe (cas
 * courant, rapide). Sinon seulement, on demande a Stripe, et on n'ouvre la
 * caisse que si l'abonnement est reellement mort.
 */

/** Statuts Stripe qui signifient "mort, plus rien a facturer". */
const STATUTS_STRIPE_MORTS = ['canceled', 'incomplete_expired'];

export type ExistingSubscriptionVerdict =
  /** Aucun abonnement: la caisse peut s'ouvrir. */
  | { kind: 'none' }
  /** Abonnement vivant: refuser (409) et renvoyer vers le changement de plan. */
  | { kind: 'live'; reason: 'local-status' | 'stripe-status'; stripeStatus?: string }
  /**
   * Abonnement mort mais l'identifiant traine en base: c'est LA cause du
   * blocage. L'appelant doit effacer l'identifiant puis ouvrir la caisse.
   */
  | { kind: 'stale'; subscriptionId: string; stripeStatus: string | null };

/**
 * @param subscriptionId `tenants.stripe_subscription_id`, tel quel.
 * @param status `tenants.subscription_status`, tel quel.
 * @param retrieveStripeStatus Lit le statut de l'abonnement chez Stripe.
 *   Doit rendre `null` quand Stripe ne connait plus cet abonnement (404).
 *   Injecte pour que cette regle soit testable sans Stripe.
 */
export async function classifyExistingSubscription({
  subscriptionId,
  status,
  retrieveStripeStatus,
}: {
  subscriptionId: string | null | undefined;
  status: string | null | undefined;
  retrieveStripeStatus: (subscriptionId: string) => Promise<string | null>;
}): Promise<ExistingSubscriptionVerdict> {
  if (!subscriptionId) {
    return { kind: 'none' };
  }

  // Cas courant: l'abonnement est utilisable (essai, actif, retard de
  // paiement). Inutile d'appeler Stripe pour le savoir.
  if (isSubscriptionUsable(status as SubscriptionStatus | null)) {
    return { kind: 'live', reason: 'local-status' };
  }

  const stripeStatus = await retrieveStripeStatus(subscriptionId);

  // Stripe ne le connait plus: l'identifiant est un residu.
  if (stripeStatus === null) {
    return { kind: 'stale', subscriptionId, stripeStatus: null };
  }

  if (STATUTS_STRIPE_MORTS.includes(stripeStatus)) {
    return { kind: 'stale', subscriptionId, stripeStatus };
  }

  // Vivant chez Stripe malgre un statut local non utilisable (`unpaid`,
  // `paused`, ou un statut local en retard sur Stripe): on NE RE-FACTURE PAS.
  return { kind: 'live', reason: 'stripe-status', stripeStatus };
}
