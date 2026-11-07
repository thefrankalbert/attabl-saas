import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  FREEZE_REASONS,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { ServiceError } from '../errors';
import type { StripeWebhookDeps } from './deps';
import { keepsExistingFreezeCause } from './status';

/**
 * Les REMBOURSEMENTS.
 *
 * `charge.refunded` n'etait pas traite du tout: un paiement d'abonnement
 * rembourse en entier laissait l'acces intact. Le client recuperait tout son
 * argent et continuait d'etre servi - fuite de revenu, et symetrique du defaut
 * des litiges (F10) ferme pour les chargebacks seulement.
 *
 * TROIS GARDES, et chacune evite de couper un client qui ne le merite pas:
 *
 * 1. REMBOURSEMENT PARTIEL: on ne gele PAS. Un geste commercial, une remise au
 *    prorata, le remboursement d'un mois en trop: le client a paye l'essentiel
 *    de sa periode. Couper la ferait plus de degats que la fuite.
 * 2. PAIEMENT HORS ABONNEMENT: aujourd'hui impossible. Verifie avant d'ecrire
 *    ce gestionnaire: les deux seules routes de caisse creent une session
 *    `mode: 'subscription'`, et le code ne cree aucun `paymentIntent` ni
 *    `invoiceItem` isole. Tout encaissement Stripe d'ATTABL est donc un
 *    abonnement. (`Charge.invoice` a disparu des types Stripe v20, donc ce
 *    rattachement ne se lit plus sur la charge.) SI UN JOUR ATTABL VEND
 *    AUTRE CHOSE - du materiel, une prestation - cette garde devra revenir:
 *    rembourser une imprimante ne doit pas couper l'abonnement.
 * 3. CAUSE D'UN GEL DEJA EN PLACE: jamais ecrasee. Un tenant deja gele pour
 *    impaye n'a rien a geler de plus; ecraser la cause transformerait son gel
 *    en un gel qu'un autre evenement aurait le droit de lever (lecon CTR7-2,
 *    voir handleDisputeCreated).
 *
 * REVERSIBLE: souscrire a nouveau remet le statut, l'acces et efface la cause
 * (`checkout.session.completed`). Verifie avant d'ecrire ce gestionnaire:
 * `invoice.paid` exclut volontairement `frozen`, donc la facture du mois
 * suivant ne leve pas ce gel - c'est une nouvelle souscription qui le leve.
 * Sans ce chemin de sortie, geler ici aurait condamne le client.
 */
export async function handleChargeRefunded(
  { supabase }: StripeWebhookDeps,
  charge: Stripe.Charge,
): Promise<void> {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;

  if (!customerId) {
    logger.warn('charge.refunded sans client resolvable', { chargeId: charge.id });
    return;
  }

  // Garde 1: un remboursement partiel ne coupe rien.
  const integral = charge.amount_refunded >= charge.amount;
  if (!integral) {
    logger.info('charge.refunded partiel: acces inchange', {
      customerId,
      chargeId: charge.id,
      montant: charge.amount,
      rembourse: charge.amount_refunded,
    });
    return;
  }

  const { data: tenant, error: readError } = await selectTolerantToMissingFreezeReason(
    'id, subscription_status, freeze_reason',
    (columns) =>
      supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).maybeSingle<{
        id: string;
        subscription_status: string | null;
        freeze_reason?: string | null;
      }>(),
    { customerId, chargeId: charge.id, handler: 'charge.refunded' },
  );

  let payload: Record<string, unknown>;
  let appliquer: (payload: Record<string, unknown>) => PromiseLike<{ error: unknown }>;

  if (readError || !tenant) {
    // Ligne illisible (echec transitoire, ou deux tenants partageant le meme
    // client Stripe: `maybeSingle` rend alors une erreur). Le gel ne doit pas
    // etre saute - l'argent est parti - mais on n'affirme pas une cause qu'on
    // n'a pas lue: on gele sans cause. Une cause deja presente survit, et un
    // gel sans cause ne se leve pas tout seul: les deux directions sont sures.
    logger.warn('charge.refunded: ligne tenant illisible, gel sans cause', {
      customerId,
      chargeId: charge.id,
    });
    payload = { subscription_status: 'frozen', is_active: false };
    appliquer = (p) => supabase.from('tenants').update(p).eq('stripe_customer_id', customerId);
  } else if (keepsExistingFreezeCause(tenant)) {
    // Garde 3.
    logger.info('charge.refunded: tenant deja gele, cause existante conservee', {
      tenantId: tenant.id,
      chargeId: charge.id,
      causeConservee: tenant.freeze_reason ?? null,
    });
    payload = { is_active: false };
    appliquer = (p) => supabase.from('tenants').update(p).eq('id', tenant.id);
  } else {
    payload = {
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: FREEZE_REASONS.REFUND,
    };
    appliquer = (p) => supabase.from('tenants').update(p).eq('id', tenant.id);
  }

  const { error: updateError } = await updateTolerantToMissingFreezeReason(payload, appliquer, {
    customerId,
    chargeId: charge.id,
    handler: 'charge.refunded',
  });

  if (updateError) {
    logger.error('charge.refunded: gel echoue', updateError);
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.warn('Tenant gele: paiement d abonnement rembourse en entier', {
    customerId,
    chargeId: charge.id,
  });
}
