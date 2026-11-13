import type Stripe from 'stripe';
import { logger } from '@/lib/logger';

/**
 * Intrusion M-01: fermer les AUTRES sessions de paiement encore ouvertes d'un
 * restaurant.
 *
 * Une session Stripe reste payable 24 h. Un proprietaire qui ouvrait la caisse
 * dans un onglet, l'abandonnait, la rouvrait et payait, puis retrouvait le
 * premier onglet et payait aussi, etait preleve DEUX fois: le garde-fou
 * "abonnement vivant" ne joue qu'a l'ouverture d'une session, jamais a son
 * paiement. Stripe ne ferme pas ces sessions de lui-meme; il recommande de les
 * expirer.
 *
 * Appele a deux moments:
 * - avant d'ouvrir une nouvelle session (la precedente devient impayable);
 * - quand une session vient d'etre payee (les autres deviennent impayables).
 *
 * Au mieux: un echec ici ne doit ni empecher d'ouvrir la caisse, ni faire
 * rejouer un paiement abouti. Il est journalise, jamais propage.
 *
 * Seules les sessions qui portent `metadata.tenant_id` du restaurant sont
 * touchees: une meme adresse peut posseder plusieurs restaurants.
 */
export async function expireOtherOpenCheckouts(
  stripe: Stripe,
  cible: {
    tenantId: string;
    /** Client Stripe du restaurant, quand il existe deja. */
    customerId?: string | null;
    /** Adresse du payeur: seule cle de recherche avant le premier paiement. */
    email?: string | null;
    /** Session a conserver (celle qui vient d'etre payee). */
    exceptSessionId?: string;
  },
): Promise<number> {
  // Les DEUX cles, pas l'une ou l'autre: avant le premier paiement une session
  // est ouverte avec l'adresse seule, sans client Stripe. Une fois ce paiement
  // fait, le client existe, mais la session oubliee n'y est pas rattachee:
  // chercher par client seul ne la trouvait pas (relecture M1). Mesure contre
  // Stripe en mode test: le filtre par adresse retrouve bien une session
  // ouverte creee avec `customer_email`.
  const filtres: Stripe.Checkout.SessionListParams[] = [];
  if (cible.customerId) filtres.push({ customer: cible.customerId });
  if (cible.email) filtres.push({ customer_details: { email: cible.email } });
  if (filtres.length === 0) return 0;

  const aExpirer = new Set<string>();
  for (const filtre of filtres) {
    try {
      const ouvertes = await stripe.checkout.sessions.list({
        ...filtre,
        status: 'open',
        limit: 20,
      });
      if (ouvertes.has_more) {
        logger.warn('Plus de 20 sessions de paiement ouvertes: liste tronquee', {
          tenantId: cible.tenantId,
        });
      }
      for (const session of ouvertes.data) {
        if (session.id === cible.exceptSessionId) continue;
        if (session.metadata?.tenant_id !== cible.tenantId) continue;
        aExpirer.add(session.id);
      }
    } catch (err) {
      logger.warn('Sessions de paiement ouvertes illisibles', {
        tenantId: cible.tenantId,
        raison: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let expirees = 0;
  for (const sessionId of aExpirer) {
    try {
      await stripe.checkout.sessions.expire(sessionId);
      expirees += 1;
    } catch (err) {
      // Deja payee ou deja expiree entre la liste et l'appel: rien a faire.
      logger.warn('Session de paiement non expiree', {
        tenantId: cible.tenantId,
        sessionId,
        raison: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (expirees > 0) {
    logger.info('Sessions de paiement ouvertes expirees', {
      tenantId: cible.tenantId,
      expirees,
    });
  }
  return expirees;
}
