import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { expireOtherOpenCheckouts } from '@/lib/billing/expire-open-checkouts';
import { ServiceError } from '../errors';
import type { StripeWebhookDeps } from './deps';
import { MARQUE_REMPLACEMENT } from './status';

/**
 * Filet contre le double abonnement (intrusion M-01), sorti de
 * `checkout.session.completed` pour que ce gestionnaire reste lisible.
 */

function estIntrouvableChezStripe(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'resource_missing'
  );
}

/**
 * Annule un abonnement. "Introuvable" vaut succes (mesure contre Stripe: c'est
 * la reponse a l'annulation d'un abonnement deja annule, donc celle d'un
 * rejeu). Tout autre echec leve: la route retire la ligne d'idempotence et
 * Stripe rejoue l'evenement.
 */
async function annulerOuLever(
  stripe: StripeWebhookDeps['stripe'],
  subscriptionId: string,
  contexte: { tenantId: string; role: string },
  /** Abonnement qui prend la place de celui-ci (voir MARQUE_REMPLACEMENT). */
  remplacePar?: string,
): Promise<void> {
  try {
    await stripe.subscriptions.cancel(
      subscriptionId,
      remplacePar
        ? { cancellation_details: { comment: `${MARQUE_REMPLACEMENT}${remplacePar}` } }
        : undefined,
    );
  } catch (err) {
    if (estIntrouvableChezStripe(err)) return;
    logger.error('Double abonnement: annulation echouee, evenement a rejouer', err, {
      ...contexte,
      subscriptionId,
    });
    throw new ServiceError('Subscription cancel failed', 'INTERNAL');
  }

  // Un ancien abonnement en impaye peut garder PLUSIEURS factures ouvertes, une
  // par periode impayee. Stripe arrete leurs relances a l'annulation, mais
  // elles restent payables a la main depuis leur lien: le client paierait un
  // abonnement mort. On les annule toutes, au mieux: un echec ici ne remet pas
  // en cause le remplacement, il est journalise. Jamais pour un doublon, dont
  // le premier paiement est justement a rembourser.
  if (!remplacePar) return;
  try {
    const ouvertes = await stripe.invoices.list({
      subscription: subscriptionId,
      status: 'open',
      limit: 20,
    });
    for (const facture of ouvertes.data) {
      if (!facture.id) continue;
      try {
        await stripe.invoices.voidInvoice(facture.id);
      } catch (err) {
        logger.warn('Double abonnement: facture ouverte de l ancien non annulee', {
          ...contexte,
          subscriptionId,
          factureId: facture.id,
          raison: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.warn('Double abonnement: factures ouvertes de l ancien illisibles', {
      ...contexte,
      subscriptionId,
      raison: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ArbitrageDoubleAbonnement {
  /** `false`: le paiement etait un doublon (ou ne payait pas), rien a ecrire. */
  poursuivre: boolean;
  /**
   * A appeler avant tout abandon qui suit: si un ancien abonnement a ete
   * annule, journalise l'alerte qui dit quel evenement renvoyer a la main.
   */
  signalerInacheve: (etape: string) => void;
}

export async function arbitrerDoubleAbonnement(
  stripe: StripeWebhookDeps['stripe'],
  {
    tenantId,
    abonnementCourant,
    subscriptionId,
    customerId,
    session,
  }: {
    tenantId: string;
    /** Abonnement enregistre sur le restaurant AVANT ce paiement. */
    abonnementCourant: string | null | undefined;
    /** Abonnement que la session payee vient d'ouvrir. */
    subscriptionId: string;
    customerId: string;
    session: Stripe.Checkout.Session;
  },
): Promise<ArbitrageDoubleAbonnement> {
  // Intrusion M-01, filet de securite: ce paiement ouvre un SECOND abonnement
  // alors que le restaurant en a deja un d'enregistre. Sans cette garde
  // l'identifiant du premier etait ecrase: il continuait d'etre preleve, et
  // plus rien dans l'application ne le voyait (la garde M-02 ignore ses
  // evenements).
  //
  // Le cas normal ne passe jamais ici: l'ouverture de la caisse refuse un
  // restaurant dont l'abonnement vit (409) et efface un identifiant perime.
  // On n'arrive ici que si deux sessions etaient ouvertes en meme temps.
  //
  // Regle: on garde l'abonnement qui PAIE, et on n'en remplace jamais un par
  // un autre qui ne paie pas.
  // - le nouveau ne paie pas (ni `active` ni `trialing`): on l'annule et on
  //   garde l'ancien, quel que soit son etat. Mesure contre Stripe: annuler un
  //   abonnement inacheve annule aussi sa facture, rien n'est preleve.
  // - l'ancien est `active`: le nouveau est un doublon. On l'annule, on
  //   n'ecrit rien. Son premier paiement reste a rembourser a la main: un
  //   remboursement d'argent ne se decide pas seul dans un webhook.
  // - l'ancien est un essai: face a un autre essai, le premier arrive reste;
  //   face a un abonnement deja preleve, c'est l'essai qu'on annule.
  // - l'ancien est en impaye, inacheve ou en pause: c'est le NOUVEAU qui paie.
  //   On annule l'ancien pour arreter ses relances, et on enregistre le
  //   nouveau.
  // - l'ancien est mort (annule, introuvable): rien a arbitrer.
  //
  // Le statut interne n'entre pas dans la decision: seul l'etat chez Stripe
  // dit lequel des deux abonnements est paye.
  let ancienAnnule = false;
  if (abonnementCourant && subscriptionId) {
    let statutCourant: string | null = null;
    try {
      statutCourant = (await stripe.subscriptions.retrieve(abonnementCourant)).status;
    } catch (err) {
      if (!estIntrouvableChezStripe(err)) {
        // Etat non etabli: ne rien ecrire, laisser Stripe rejouer.
        logger.error('Abonnement courant illisible chez Stripe (double paiement ?)', err, {
          tenantId,
          abonnementCourant,
        });
        throw new ServiceError('Current subscription unreadable', 'INTERNAL');
      }
    }

    const ancienVivant =
      statutCourant !== null &&
      statutCourant !== 'canceled' &&
      statutCourant !== 'incomplete_expired';

    if (ancienVivant) {
      let statutNouveau: string;
      try {
        statutNouveau = (await stripe.subscriptions.retrieve(subscriptionId)).status;
      } catch (err) {
        if (estIntrouvableChezStripe(err)) {
          // Permanent: rejouer trois jours n'y changerait rien. L'ancien reste.
          logger.error('checkout.session.completed: nouvel abonnement introuvable', err, {
            tenantId,
            subscriptionId,
          });
          return { poursuivre: false, signalerInacheve: () => undefined };
        }
        logger.error('Nouvel abonnement illisible chez Stripe (double paiement ?)', err, {
          tenantId,
          subscriptionId,
        });
        throw new ServiceError('New subscription unreadable', 'INTERNAL');
      }

      const nouveauPaie = statutNouveau === 'active' || statutNouveau === 'trialing';
      const ancienPaie =
        statutCourant === 'active' || (statutCourant === 'trialing' && statutNouveau !== 'active');

      if (!nouveauPaie || ancienPaie) {
        // Un echec d'annulation ne s'avale pas: le doublon continuerait d'etre
        // preleve sans que personne le voie. On leve, Stripe rejoue. Au rejeu,
        // un doublon deja annule repond "introuvable": c'est un succes.
        await annulerOuLever(stripe, subscriptionId, { tenantId, role: 'doublon' });
        if (nouveauPaie) {
          logger.error(
            'DOUBLE ABONNEMENT: doublon annule, son premier paiement est a rembourser a la main',
            undefined,
            { tenantId, abonnementCourant, doublon: subscriptionId, sessionId: session.id },
          );
        } else {
          logger.warn('Double abonnement: nouveau non paye annule, l ancien est conserve', {
            tenantId,
            abonnementCourant,
            statutCourant,
            nouveau: subscriptionId,
            statutNouveau,
          });
        }
        // Les autres sessions encore ouvertes ne doivent pas produire un
        // troisieme abonnement.
        await expireOtherOpenCheckouts(stripe, {
          tenantId,
          customerId,
          email: session.customer_details?.email ?? session.customer_email,
          exceptSessionId: session.id,
        });
        return { poursuivre: false, signalerInacheve: () => undefined };
      }

      // L'annulation est MARQUEE: Stripe va emettre la suppression de l'ancien,
      // et elle peut etre traitee avant l'ecriture ci-dessous. Sans la marque,
      // elle gelait le restaurant qui vient de payer et effacait son
      // identifiant (voir handleSubscriptionDeleted, qui verifie le remplacant).
      await annulerOuLever(
        stripe,
        abonnementCourant,
        { tenantId, role: 'ancien remplace' },
        subscriptionId,
      );
      ancienAnnule = true;
      logger.warn('Double abonnement: ancien non paye annule, le nouveau est enregistre', {
        tenantId,
        ancien: abonnementCourant,
        statutAncien: statutCourant,
        nouveau: subscriptionId,
      });
    }
  }

  // A partir d'ici, tout abandon laisse un ancien abonnement annule et un
  // nouveau non enregistre. Stripe rejoue l'evenement; s'il n'y parvient pas
  // (panne longue), l'alerte ci-dessous dit quoi renvoyer a la main.
  const signalerInacheve = (etape: string): void => {
    if (!ancienAnnule) return;
    logger.error(
      'DOUBLE ABONNEMENT: ancien annule mais nouveau non enregistre, renvoyer cet evenement depuis Stripe si le rejeu echoue',
      undefined,
      {
        tenantId,
        ancien: abonnementCourant,
        nouveau: subscriptionId,
        sessionId: session.id,
        etape,
      },
    );
  };

  return { poursuivre: true, signalerInacheve };
}
