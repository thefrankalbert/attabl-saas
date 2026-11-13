import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { ServiceError } from '../errors';
import type { StripeWebhookDeps } from './deps';

/**
 * Les deux relectures de l'etat REEL d'un abonnement chez Stripe dont les
 * gestionnaires d'abonnement ont besoin, sorties de subscription.ts pour le
 * garder lisible.
 */

/**
 * Relit l'abonnement chez Stripe. Une panne de lecture leve, pour que Stripe
 * rejoue: l'evenement n'est jamais applique a l'aveugle. Le contenu de
 * l'evenement ne sert de repli que si l'abonnement est introuvable (permanent)
 * ou si la lecture ne rend pas CET abonnement.
 */
export async function lireEtatReel(
  stripe: StripeWebhookDeps['stripe'],
  evenement: Stripe.Subscription,
  tenantId: string,
): Promise<Stripe.Subscription> {
  try {
    const reel = await stripe.subscriptions.retrieve(evenement.id);
    // L'identifiant doit etre present ET identique: sans cela un objet vide
    // remplacerait le contenu de l'evenement.
    if (evenement.id && reel?.id === evenement.id) {
      if (reel.status !== evenement.status) {
        logger.warn('subscription.updated perime: etat reel de Stripe applique', {
          tenantId,
          statutEvenement: evenement.status,
          statutReel: reel.status,
        });
      }
      return reel;
    }
  } catch (err) {
    const introuvable =
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'resource_missing';
    if (!introuvable) {
      // Stripe est injoignable: appliquer le contenu de l'evenement rouvrirait
      // exactement le defaut qu'on ferme (un evenement perime applique tel
      // quel). On n'ecrit rien et on laisse Stripe rejouer.
      logger.error('subscription.updated: etat reel illisible, evenement a rejouer', err, {
        tenantId,
        subscriptionId: evenement.id,
      });
      throw new ServiceError('Subscription state unreadable', 'INTERNAL');
    }
    // Introuvable est permanent: rejouer n'y changerait rien.
    logger.warn('subscription.updated: abonnement introuvable, evenement applique tel quel', {
      tenantId,
      subscriptionId: evenement.id,
    });
  }
  return evenement;
}

/**
 * Le remplacant designe par la marque d'annulation existe-t-il VRAIMENT, pour
 * CE restaurant, et paie-t-il ?
 *
 * La marque arrive dans un champ que le client peut remplir lui-meme en
 * resiliant depuis le portail de facturation. On ne lui fait donc confiance
 * que si Stripe confirme les trois points:
 * - l'abonnement designe existe;
 * - il est en regle (active ou trialing);
 * - ses metadonnees portent ce restaurant. Elles sont ecrites par notre
 *   serveur a l'ouverture de la caisse (`subscription_data.metadata.tenant_id`)
 *   et le client ne peut pas les modifier.
 * Sinon la suppression est traitee comme une resiliation ordinaire: gel.
 *
 * Une panne de lecture leve, pour que Stripe rejoue: on ne gele pas un
 * restaurant qui vient de payer parce que Stripe etait lent, et on ne laisse
 * pas non plus passer une marque non verifiee.
 */
export async function remplacantVerifie(
  stripe: StripeWebhookDeps['stripe'],
  remplacantId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const remplacant = await stripe.subscriptions.retrieve(remplacantId);
    return (
      (remplacant.status === 'active' || remplacant.status === 'trialing') &&
      remplacant.metadata?.tenant_id === tenantId
    );
  } catch (err) {
    const introuvable =
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'resource_missing';
    if (introuvable) return false;
    logger.error('subscription.deleted: remplacant illisible, evenement a rejouer', err, {
      tenantId,
      remplacantId,
    });
    throw new ServiceError('Replacement subscription unreadable', 'INTERNAL');
  }
}
