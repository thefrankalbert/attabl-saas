import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { isSubscriptionUsable } from '@/lib/plans/features';
import {
  FREEZE_REASONS,
  type FreezeReason,
  freezeReasonForStatus,
} from '@/lib/billing/freeze-reason';
import type { BillingInterval, SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

/**
 * Les REGLES D'ETAT du webhook Stripe: traduire ce que dit Stripe, et decider
 * quel acces une ecriture a le droit de rendre. Aucune de ces fonctions ne
 * touche la base ni le reseau - c'est ce qui permet de les lire d'un bloc.
 */

const VALID_PLANS: readonly SubscriptionPlan[] = ['starter', 'pro', 'business', 'enterprise'];
const VALID_INTERVALS: readonly BillingInterval[] = ['monthly', 'semiannual', 'yearly'];

export function isValidPlan(value: string | undefined): value is SubscriptionPlan {
  return !!value && (VALID_PLANS as readonly string[]).includes(value);
}

export function isValidInterval(value: string | undefined): value is BillingInterval {
  return !!value && (VALID_INTERVALS as readonly string[]).includes(value);
}

/**
 * Detect billing interval from Stripe subscription item.
 */
export function detectBillingInterval(subscription: Stripe.Subscription): BillingInterval {
  const item = subscription.items?.data?.[0];
  if (!item?.plan) return 'monthly';

  const interval = item.plan.interval;
  const intervalCount = item.plan.interval_count;

  if (interval === 'year') return 'yearly';
  if (interval === 'month' && intervalCount === 6) return 'semiannual';
  return 'monthly';
}

/**
 * Mappe le statut Stripe vers le statut interne du tenant.
 */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'cancelled';
    case 'unpaid':
      // F3: 'unpaid' est la FIN de la relance Stripe, pas une etape de plus.
      // Le mapper sur 'past_due' - qui reste entitlant - avait une consequence
      // qu'on ne voyait nulle part: si le reglage Stripe de fin de relance est
      // "mark subscription as unpaid" plutot que "cancel", aucun
      // customer.subscription.deleted n'arrive JAMAIS, et le tenant garde son
      // plan gratuitement, sans borne de temps. 'frozen' est non entitlant.
      return 'frozen';
    case 'incomplete':
      // Initial payment not yet confirmed: bounded grace (past_due), self-corrects
      // to 'active' on the next webhook once payment succeeds.
      return 'past_due';
    case 'incomplete_expired':
      // Initial payment failed and the subscription is terminal.
      return 'cancelled';
    case 'paused':
      return 'paused';
    default:
      // Fail closed for billing entitlement: an unrecognized Stripe status must NOT
      // grant active paid access. 'frozen' is non-entitling (see plans/features.ts);
      // a known status arriving later will restore the correct state.
      logger.warn('Unknown Stripe status, defaulting to frozen (fail-closed)', { stripeStatus });
      return 'frozen';
  }
}

/**
 * `is_active` DOIT suivre le statut d'abonnement, dans les deux sens.
 *
 * Trouve en audit: le gel posait is_active=false, mais AUCUN chemin ne le
 * remettait a true. Un restaurateur gele qui payait repassait 'active' avec
 * is_active a false: vitrine morte, POST /api/orders refuse, QR codes de salle
 * inoperants - pour un client qui venait de payer, et sans le moindre log.
 * Poser la valeur ici, a chaque ecriture de statut, est le seul moyen de ne pas
 * dependre du fait que chaque handler y pense.
 *
 * La regle vit dans `isSubscriptionUsable`: une seconde table de verite ici
 * divergerait au premier statut ajoute.
 */
export const isActiveForStatus = isSubscriptionUsable;

/** Statuts pour lesquels Stripe est REELLEMENT paye a l'instant present. */
const HEALTHY_STATUSES: readonly SubscriptionStatus[] = ['active', 'trial'];

export function isHealthySubscriptionStatus(status: string | null | undefined): boolean {
  return !!status && (HEALTHY_STATUSES as readonly string[]).includes(status);
}

/**
 * Un statut ENTITLANT sans preuve de paiement. Aujourd'hui: 'past_due' seul
 * (Stripe relance, l'argent n'est pas rentre, mais on ne coupe pas encore).
 *
 * REGLE DU FICHIER, une seule phrase: un tel statut ne s'ecrit QUE depuis un
 * statut sain. Autrement dit, il peut DEGRADER un abonnement qui paie, jamais
 * RELEVER un abonnement coupe.
 *
 * Elle existe parce que les deux gestionnaires qui ecrivent 'past_due' l'ont
 * enfreinte chacun de son cote. `invoice.payment_failed` effacait un gel pour
 * litige ou une resiliation a chaque echec de paiement. Et
 * `customer.subscription.updated`, en plus, remettait `past_due_since` a
 * maintenant: un tenant gele par le cron pour impaye depasse etait degele par le
 * premier evenement de relance, son compte a rebours de 15 jours repartait, et la
 * boucle se repetait - plan payant gratuit indefiniment. Cela annulait du meme
 * coup la borne "regel sous 24 h" sur laquelle `charge.dispute.closed` appuie sa
 * limite assumee.
 *
 * Un statut SAIN ('active', 'trial') prouve au contraire que Stripe est paye:
 * il rend l'acces legitimement, comme `invoice.paid` - qui est le seul
 * gestionnaire reellement adosse a une facture encaissee. Un statut NON
 * entitlant ('cancelled', 'frozen', 'paused') s'ecrit toujours: la regle ne
 * protege que contre une reprise d'acces.
 *
 * CTR-3, l'etat des lieux exact - QUATRE gestionnaires ecrivent un statut
 * entitlant, et la regle s'applique maintenant aux quatre:
 *   - `checkout.session.completed`: garde + fail-closed si Stripe est illisible
 *     (il ecrit `mapStripeStatus`, qui peut rendre `past_due` sur un
 *     `incomplete`: ce n'etait donc PAS une preuve de paiement);
 *   - `customer.subscription.updated`: garde;
 *   - `invoice.payment_failed`: garde;
 *   - `invoice.paid`: pas de garde et il n'en faut pas - la facture encaissee
 *     EST la preuve, et son ecriture est scopee `.eq('subscription_status',
 *     'past_due')`, donc elle ne voit aucun gel.
 * Reste `charge.dispute.closed`, qui ecrit depuis un gel: il releve de la cause
 * du gel (`freeze_reason`) plus de la relecture chez Stripe, pas de cette regle.
 */
export function isEntitlingWithoutPayment(status: SubscriptionStatus): boolean {
  return isActiveForStatus(status) && !isHealthySubscriptionStatus(status);
}

/** Les deux colonnes qui portent une decision HUMAINE sur l'acces d'un tenant. */
export interface PlatformLocks {
  suspended_at?: string | null;
  deleted_at?: string | null;
}

/**
 * CTR7-1 - `is_active` pour un statut donne, SAUF si la plateforme a coupe.
 *
 * Une suspension decidee par le super-admin ne s'exprimait en base que par
 * `is_active = false`: `suspended_at` etait ecrit et affiche dans la console
 * plateforme, mais applique NULLE PART. Or CINQ gestionnaires de ce webhook
 * reecrivent `is_active` en le calculant sur le seul statut d'abonnement
 * (`checkout.session.completed`, les deux branches de
 * `customer.subscription.updated`, `invoice.payment_failed`,
 * `charge.dispute.closed`), et `isActiveForStatus('past_due')` vaut `true`:
 * un tenant suspendu dont Stripe disait encore `past_due` etait donc RALLUME
 * par le premier evenement de relance - vitrine, prise de commande et tableau
 * de bord rouverts, la console plateforme continuant d'afficher "suspendu".
 *
 * Le statut REEL de l'abonnement continue d'etre ecrit: la base ne doit pas
 * mentir sur ce que dit Stripe. Seul l'ACCES est retenu, et il est rendu par
 * `unsuspendTenant` / `restoreTenant`, qui sont les seuls chemins autorises a
 * defaire une decision humaine.
 *
 * `deleted_at` est deja applique a la lecture partout (`order-queries`,
 * `lib/cache`); il est ajoute ici par symetrie, pour qu'aucun evenement Stripe
 * ne puisse reecrire `is_active = true` sur une ligne supprimee.
 */
export function isActiveUnlessLocked(
  status: SubscriptionStatus,
  tenant: PlatformLocks | null | undefined,
): boolean {
  if (tenant?.suspended_at || tenant?.deleted_at) return false;
  return isActiveForStatus(status);
}

/** L'etat de gel courant d'une ligne, tel que les gardes ci-dessous le lisent. */
export interface CurrentFreeze {
  subscription_status?: string | null;
  freeze_reason?: string | null;
}

/**
 * CTR7-2 - la cause a ecrire, sans jamais ECRASER une cause deja posee.
 *
 * L'invariant "non nul si et seulement si `frozen`" rendait l'OUBLI d'une cause
 * inoffensif, mais pas son ECRASEMENT - et c'est l'ecrasement qui se produit:
 * la branche `else` de `customer.subscription.updated` ecrivait
 * `stripe_unpaid` par-dessus `dispute`, donc un litige gagne ne degelait plus
 * un client qui paie (`charge.dispute.closed` ne leve que la cause `dispute`).
 *
 * Regle: on n'ecrase jamais la cause d'un gel DEJA en place. Un tenant gele
 * reste gele, et la raison qui l'a gele la premiere garde la main. L'effacement
 * sur sortie de gel, lui, est conserve tel quel: c'est lui qui tient
 * l'invariant.
 */
/**
 * B-3 - la regle "un gel DEJA en place garde sa cause", ecrite UNE seule fois.
 *
 * Elle etait ecrite deux fois, et differemment: le helper ci-dessous exigeait
 * une cause NON VIDE, alors que `charge.dispute.created` ne regardait que le
 * statut. Sur un tenant `frozen` dont `freeze_reason` est NULL - l'etat de tout
 * tenant gele pendant la fenetre de tolerance, puisque c'est exactement ce que
 * produit `updateTolerantToMissingFreezeReason` - la cause `dispute` n'etait
 * donc plus posee, et `charge.dispute.closed` refusait ensuite de degeler: un
 * client qui GAGNE son litige, et qui n'a rien a payer, restait gele jusqu'au
 * roulement de periode. Un gel sans cause n'est pas un gel a preserver: c'est
 * un gel dont la cause est encore a ecrire.
 */
/**
 * Un gel pour REMBOURSEMENT bloque-t-il le degel ?
 *
 * Pourquoi ce garde-fou existe. Un remboursement ne change PAS le statut de
 * l'abonnement chez Stripe: il reste `active`. Or `active` est un statut sain,
 * donc `isEntitlingWithoutPayment` ne le refuse pas, et le garde-fou des
 * litiges ne regarde que la cause `dispute`. Resultat mesure sur le code:
 * le PROCHAIN `customer.subscription.updated` - Stripe en envoie a chaque
 * roulement de periode ou modification - levait le gel pour remboursement
 * SANS QU'UN SEUL FRANC SOIT RENTRE. Le gel etait cosmetique.
 *
 * Meme forme que `unsettledDisputeBlocksUnfreeze`: la cause dit quel gel on a
 * le droit de lever. Un gel pour remboursement ne se leve que sur une PREUVE
 * D'ARGENT NEUF - une facture payee (`invoice.paid`) ou une nouvelle
 * souscription (`checkout.session.completed`) - jamais sur le simple mot de
 * Stripe disant que l'abonnement existe toujours.
 */
export function refundFreezeBlocksUnfreeze(current: CurrentFreeze | null | undefined): boolean {
  return (
    current?.subscription_status === 'frozen' && current.freeze_reason === FREEZE_REASONS.REFUND
  );
}

export function keepsExistingFreezeCause(current: CurrentFreeze | null | undefined): boolean {
  return current?.subscription_status === 'frozen' && !!current.freeze_reason;
}

export function freezeReasonPreservingCause(
  nextStatus: SubscriptionStatus,
  fallbackReason: FreezeReason,
  current: CurrentFreeze | null | undefined,
  context: Record<string, unknown>,
): string | null {
  const next = freezeReasonForStatus(nextStatus, fallbackReason);
  if (next === null) return null;
  if (keepsExistingFreezeCause(current)) {
    logger.info('Gel deja en place: la cause existante est conservee', {
      ...context,
      keptReason: current?.freeze_reason,
      refusedReason: next,
    });
    return current?.freeze_reason ?? next;
  }
  return next;
}
