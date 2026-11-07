import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { FREEZE_REASONS } from '@/lib/billing/freeze-reason';
import type { CurrentFreeze } from './status';

/**
 * Tout ce que le webhook doit RELIRE chez Stripe au sujet des litiges, avant de
 * rendre un acces. Ces fonctions ne touchent pas la base: elles ne repondent
 * qu'a une question, "l'argent est-il encore retenu ?".
 */

/**
 * Le client Stripe du litige, ou null si on ne peut pas le resoudre.
 *
 * L'appel etait fait sans try/catch: un timeout ou un 429 de l'API Stripe
 * remontait au catch externe, qui supprime la ligne d'idempotence et renvoie
 * 500. Stripe rejoue alors pendant trois jours, et un taux d'echec durable finit
 * par lui faire DESACTIVER l'endpoint - ce qui ferait perdre
 * checkout.session.completed et invoice.paid pour TOUS les clients. Un litige ne
 * doit pas pouvoir mettre l'activation d'abonnement en peril.
 *
 * `payment_intent` est `string | PaymentIntent` cote Stripe: on gere les deux
 * plutot que de mentir au typage avec un `as string`.
 */
export async function disputeCustomerId(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const pi = dispute.payment_intent;
  if (!pi) return null;
  if (typeof pi !== 'string') return typeof pi.customer === 'string' ? pi.customer : null;

  try {
    const intent = await stripe.paymentIntents.retrieve(pi);
    return typeof intent.customer === 'string' ? intent.customer : null;
  } catch (err) {
    logger.error('Impossible de resoudre le client du litige', err, { disputeId: dispute.id });
    return null;
  }
}

/**
 * Les SEULS etats d'un litige qui ne retient plus d'argent: gagne, ou alerte
 * precoce classee sans suite.
 *
 * CTR7-4: la liste etait ecrite a l'envers - elle enumerait les litiges
 * "ouverts" (`needs_response`, `under_review`) et oubliait les deux etats
 * d'alerte precoce (`warning_needs_response`, `warning_under_review`), pourtant
 * presents dans `Dispute.Status`. Un litige en alerte comptait donc comme
 * "aucun litige". Et un litige PERDU ne bloquait rien, alors que l'argent est
 * parti. Enumerer ce qui LIBERE, et bloquer sur tout le reste, est la seule
 * formulation qui resiste a un etat ajoute par Stripe demain.
 */
const SETTLED_DISPUTE_STATUSES: readonly string[] = ['won', 'warning_closed'];

/**
 * Reste-t-il, pour ce client, un litige qui retient de l'argent - autre que
 * celui qu'on est en train de fermer ?
 *
 * La cause du gel (`freeze_reason`) dit qu'on a le droit de lever CE gel. Elle
 * ne dit pas s'il reste un AUTRE litige en cours: deux litiges simultanes
 * portent la meme cause, et gagner le premier ne doit pas rendre l'acces tant
 * que le second retient de l'argent. C'est la methode que le depot a deja
 * retenue pour l'abonnement: ne rien deduire, relire l'etat chez Stripe.
 *
 * Renvoie `null` quand l'etat n'a pas pu etre etabli; l'appelant reste alors
 * gele (fail-closed).
 *
 * Limite assumee, ecrite ici pour qu'elle ne surprenne personne: la lecture
 * porte sur les 100 derniers paiements du client (`charges.list` n'est pas
 * pagine: ni `has_more`, ni `autoPagingEach`). Un litige rattache a un paiement
 * plus ancien n'est pas vu. Le verrou principal reste la cause du gel.
 *
 * Cout: un appel, plus un par paiement effectivement conteste - en pratique zero
 * ou un. On passe par `charges.list` parce que `disputes.list` ne sait pas
 * filtrer par client.
 */
async function hasUnsettledDispute(
  stripe: Stripe,
  customerId: string,
  closingDisputeId: string | null,
): Promise<boolean | null> {
  try {
    const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
    const disputedChargeIds = charges.data
      .filter((charge) => charge.disputed)
      .map((charge) => charge.id);

    for (const chargeId of disputedChargeIds) {
      const disputes = await stripe.disputes.list({ charge: chargeId, limit: 100 });
      for (const other of disputes.data) {
        // Le litige qu'on ferme ne doit pas se bloquer lui-meme.
        if (closingDisputeId !== null && other.id === closingDisputeId) continue;
        if (!SETTLED_DISPUTE_STATUSES.includes(other.status)) {
          logger.warn('Un litige retient encore de l argent: le tenant reste gele', {
            customerId,
            disputeId: other.id,
            disputeStatus: other.status,
          });
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    logger.error('Litiges du client illisibles: le tenant reste gele', err, { customerId });
    return null;
  }
}

/**
 * CTR7-4 - faut-il rester gele parce qu'un litige retient de l'argent ?
 *
 * Seul `charge.dispute.closed` faisait ce controle. `customer.subscription.updated`
 * et `checkout.session.completed` peuvent eux aussi degeler un tenant gele POUR
 * LITIGE (il suffit que Stripe dise `active`), et ils ne le faisaient pas: le
 * meme acces etait donc rendu ou refuse selon l'evenement qui arrivait en
 * premier. Les trois passent desormais par ici.
 *
 * `true` = il faut rester gele. L'appel reseau n'est fait que quand l'ecriture
 * RENDRAIT l'acces et que le gel courant a bien un litige pour cause.
 */
export async function unsettledDisputeBlocksUnfreeze(
  stripe: Stripe,
  customerId: string | null | undefined,
  current: CurrentFreeze | null | undefined,
  grantsAccess: boolean,
  closingDisputeId: string | null,
): Promise<boolean> {
  if (!grantsAccess) return false;
  if (current?.subscription_status !== 'frozen') return false;
  if (current.freeze_reason !== FREEZE_REASONS.DISPUTE) return false;
  if (!customerId) {
    // Gel pour litige et client Stripe inconnu: on ne peut rien verifier.
    logger.warn('Gel pour litige sans client Stripe resolvable: le tenant reste gele', {});
    return true;
  }
  // `true` (litige non regle) comme `null` (etat illisible): on reste gele.
  return (await hasUnsettledDispute(stripe, customerId, closingDisputeId)) !== false;
}
