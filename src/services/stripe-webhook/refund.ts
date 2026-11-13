import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  FREEZE_REASONS,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { getIntervalFromPriceId } from '@/lib/stripe/server';
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
 * QUATRE GARDES (la quatrieme, M-08, est decrite sur `rembourseLaPeriodeEnCours`),
 * et chacune evite de couper un client qui ne le merite pas:
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
const UN_JOUR_S = 86_400;
const DEUX_MOIS_S = 60 * UN_JOUR_S;

function estIntrouvable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'resource_missing'
  );
}

function intervalleDuPrix(ligne: Stripe.InvoiceLineItem): string | null {
  const prix = ligne.pricing?.price_details?.price;
  const prixId = typeof prix === 'string' ? prix : prix?.id;
  if (!prixId) return null;
  try {
    return getIntervalFromPriceId(prixId);
  } catch (err) {
    // La table des prix leve si une variable d'environnement manque. Sans ce
    // repli, le remboursement serait rejoue trois jours sans jamais etre
    // traite: on compare alors les durees.
    logger.warn('charge.refunded: table des prix illisible, repli sur les durees', {
      raison: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Cette facture de CHANGEMENT paie-t-elle un passage a un intervalle PLUS LONG
 * (mensuel vers annuel), plutot que la difference d'une montee en gamme ?
 *
 * Stripe ne les distingue ni par la raison ni par le drapeau "prorata"
 * (mesure en mode test: les lignes sont des proratas dans les deux cas).
 *
 * REGLE, la meme sur les deux chemins:
 * - mensuel vers annuel: OUI. Cette facture est le paiement de l'annee.
 * - montee en gamme, meme intervalle: NON. Elle ne paie qu'une difference.
 * - annuel vers mensuel: NON, jamais. La periode est financee pour l'essentiel
 *   par le credit du paiement annuel, que le client garde; rembourser la
 *   petite difference ne rend pas la periode. Au pire, moins d'un mois est
 *   offert, par un remboursement que la plateforme decide elle-meme.
 *
 * Chemin 1, nos prix: l'intervalle du prix paye est `yearly` et celui du prix
 * credite `monthly`.
 * Chemin 2, un prix inconnu: la ligne payee couvre NETTEMENT plus longtemps
 * que la creditee. Mesure contre Stripe: 365 jours payes contre 30 credites
 * pour un passage a l'annuel, durees egales pour une montee en gamme. Dans un
 * passage de l'annuel au mensuel la ligne payee fait 30 jours et la creditee
 * entre 0 et 30: l'ecart ne depasse jamais un mois. Le seuil de deux mois
 * separe donc les cas sans ambiguite, et rend le meme verdict que le chemin 1
 * (cinquieme relecture adverse: un seuil d'un jour gelait a tort ici).
 *
 * Sans ligne creditee, rien a comparer: c'est traite comme le paiement d'une
 * periode.
 */
function allongeLaPeriode(
  payees: Stripe.InvoiceLineItem[],
  creditees: Stripe.InvoiceLineItem[],
): boolean {
  const duree = (ligne: Stripe.InvoiceLineItem): number => ligne.period.end - ligne.period.start;
  return payees.some((payee) =>
    creditees.every((creditee) => {
      const intervallePaye = intervalleDuPrix(payee);
      const intervalleCredite = intervalleDuPrix(creditee);
      if (intervallePaye && intervalleCredite) {
        return intervallePaye === 'yearly' && intervalleCredite === 'monthly';
      }
      return duree(payee) - duree(creditee) > DEUX_MOIS_S;
    }),
  );
}

/**
 * Intrusion M-08: le paiement rembourse est-il celui qui FINANCE la periode en
 * cours de l'abonnement du restaurant ?
 *
 * Le gel partait sur le remboursement integral de N'IMPORTE QUEL paiement du
 * client: rembourser une vieille facture, le doublon d'un double paiement, ou
 * la seule difference d'une montee en gamme, gelait un restaurant dont la
 * periode en cours est payee. Et ce gel n'a aucune sortie automatique
 * (`invoice.paid` l'ignore, la caisse repond 409 tant que l'abonnement vit).
 *
 * On retrouve la FACTURE du paiement rembourse, et on ne gele que si:
 * 1. elle appartient a l'abonnement courant du restaurant;
 * 2. une de ses lignes payees finit A LA FIN de la periode courante de
 *    l'abonnement: c'est elle qui finance la periode. Une facture mensuelle
 *    anterieure a un passage a l'annuel finit bien avant: la rembourser ne rend
 *    pas l'annee (troisieme relecture adverse);
 * 3. ce n'est pas la simple difference d'une montee en gamme, qui finit aussi
 *    a la fin de la periode sans la financer (voir `allongeLaPeriode`).
 *
 * Ce n'est PAS "la derniere facture de l'abonnement": depuis M-03 un
 * changement de formule cree une facture de prorata qui devient la derniere.
 *
 * `true` quand on ne peut pas comparer (pas d'abonnement enregistre, paiement,
 * facture ou abonnement introuvable): le gel d'avant est conserve, jamais
 * saute par defaut. Toute autre panne de lecture leve: Stripe rejouera.
 */
async function rembourseLaPeriodeEnCours(
  stripe: StripeWebhookDeps['stripe'],
  subscriptionId: string | null | undefined,
  charge: Stripe.Charge,
): Promise<boolean> {
  const paiement =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!subscriptionId || !paiement) return true;

  let facture: Stripe.Invoice;
  let finDePeriode: number | undefined;
  try {
    const liens = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paiement },
      limit: 1,
    });
    const lien = liens.data[0]?.invoice;
    const factureId = typeof lien === 'string' ? lien : lien?.id;
    if (!factureId) return true;
    facture = await stripe.invoices.retrieve(factureId);

    const lienAbonnement = facture.parent?.subscription_details?.subscription;
    const abonnementFacture =
      typeof lienAbonnement === 'string' ? lienAbonnement : lienAbonnement?.id;
    if (abonnementFacture !== subscriptionId) return false;

    const abonnement = await stripe.subscriptions.retrieve(subscriptionId);
    finDePeriode = abonnement.items?.data?.[0]?.current_period_end;
  } catch (err) {
    // Introuvable est PERMANENT: rejouer trois jours n'y changerait rien.
    if (estIntrouvable(err)) return true;
    throw err;
  }
  if (!finDePeriode) return true;

  const fin = finDePeriode;
  const payees = facture.lines.data.filter((ligne) => ligne.amount > 0);
  const creditees = facture.lines.data.filter((ligne) => ligne.amount < 0);
  const financeLaPeriode = payees.some((ligne) => Math.abs(ligne.period.end - fin) <= UN_JOUR_S);
  if (!financeLaPeriode) return false;
  if (facture.billing_reason !== 'subscription_update') return true;
  return allongeLaPeriode(payees, creditees);
}

export async function handleChargeRefunded(
  { supabase, stripe }: StripeWebhookDeps,
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
    'id, subscription_status, stripe_subscription_id, freeze_reason',
    (columns) =>
      supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).maybeSingle<{
        id: string;
        subscription_status: string | null;
        stripe_subscription_id?: string | null;
        freeze_reason?: string | null;
      }>(),
    { customerId, chargeId: charge.id, handler: 'charge.refunded' },
  );

  // Garde 4 (M-08): seul le remboursement de la periode en cours coupe l'acces.
  if (tenant && !readError) {
    let periodeEnCours: boolean;
    try {
      periodeEnCours = await rembourseLaPeriodeEnCours(
        stripe,
        tenant.stripe_subscription_id,
        charge,
      );
    } catch (err) {
      logger.error('charge.refunded: facture du paiement illisible chez Stripe', err, {
        tenantId: tenant.id,
        chargeId: charge.id,
      });
      // La route retire la ligne d'idempotence pour que Stripe retraite.
      throw new ServiceError('Refunded invoice unreadable', 'INTERNAL');
    }
    if (!periodeEnCours) {
      logger.info('charge.refunded: paiement hors periode en cours, acces inchange', {
        tenantId: tenant.id,
        chargeId: charge.id,
      });
      return;
    }
  }

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
