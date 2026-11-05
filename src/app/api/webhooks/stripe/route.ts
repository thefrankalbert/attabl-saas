import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getStripe, getPlanFromPriceId, getIntervalFromPriceId } from '@/lib/stripe/server';
import { isSubscriptionUsable } from '@/lib/plans/features';
import {
  type FreezeReason,
  FREEZE_REASONS,
  freezeReasonForStatus,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import type { BillingInterval, SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

const VALID_PLANS: readonly SubscriptionPlan[] = ['starter', 'pro', 'business', 'enterprise'];
const VALID_INTERVALS: readonly BillingInterval[] = ['monthly', 'semiannual', 'yearly'];

function isValidPlan(value: string | undefined): value is SubscriptionPlan {
  return !!value && (VALID_PLANS as readonly string[]).includes(value);
}

function isValidInterval(value: string | undefined): value is BillingInterval {
  return !!value && (VALID_INTERVALS as readonly string[]).includes(value);
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Detect billing interval from Stripe subscription item.
 */
function detectBillingInterval(subscription: Stripe.Subscription): BillingInterval {
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
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
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
const isActiveForStatus = isSubscriptionUsable;

/** Statuts pour lesquels Stripe est REELLEMENT paye a l'instant present. */
const HEALTHY_STATUSES: readonly SubscriptionStatus[] = ['active', 'trial'];

function isHealthySubscriptionStatus(status: string | null | undefined): boolean {
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
function isEntitlingWithoutPayment(status: SubscriptionStatus): boolean {
  return isActiveForStatus(status) && !isHealthySubscriptionStatus(status);
}

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
async function disputeCustomerId(
  stripe: ReturnType<typeof getStripe>,
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
  stripe: ReturnType<typeof getStripe>,
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

/** Les deux colonnes qui portent une decision HUMAINE sur l'acces d'un tenant. */
interface PlatformLocks {
  suspended_at?: string | null;
  deleted_at?: string | null;
}

/**
 * CTR7-1 - `is_active` pour un statut donne, SAUF si la plateforme a coupe.
 *
 * Une suspension decidee par le super-admin ne s'exprimait en base que par
 * `is_active = false`: `suspended_at` etait ecrit et affiche dans la console
 * plateforme, mais applique NULLE PART. Or CINQ gestionnaires de ce fichier
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
function isActiveUnlessLocked(
  status: SubscriptionStatus,
  tenant: PlatformLocks | null | undefined,
): boolean {
  if (tenant?.suspended_at || tenant?.deleted_at) return false;
  return isActiveForStatus(status);
}

/** L'etat de gel courant d'une ligne, tel que les gardes ci-dessous le lisent. */
interface CurrentFreeze {
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
function keepsExistingFreezeCause(current: CurrentFreeze | null | undefined): boolean {
  return current?.subscription_status === 'frozen' && !!current.freeze_reason;
}

function freezeReasonPreservingCause(
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
async function unsettledDisputeBlocksUnfreeze(
  stripe: ReturnType<typeof getStripe>,
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

export async function POST(request: Request) {
  let stripe: ReturnType<typeof getStripe>;
  let webhookSecret: string;
  try {
    stripe = getStripe();
    webhookSecret = getWebhookSecret();
  } catch (err) {
    logger.error('Stripe webhook env vars missing', err);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Tracks the stripe_events row inserted by THIS request so the outer catch can
  // roll it back if a handler throws - otherwise Stripe's retry would short-circuit
  // as "already processed" and the side effect would be permanently lost.
  let recordedEventId: string | null = null;
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      logger.error('Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Webhook signature verification failed', err, { errorMessage });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Utiliser admin client pour bypass RLS
    const supabase = createAdminClient();

    // Idempotency: short-circuit replayed events. INSERT ON CONFLICT DO NOTHING
    // atomically inserts the event id. If a row is returned, this is the first
    // time we see this event. If null/empty, Stripe is replaying (retries up to
    // 3 days, or manual dashboard resend) - return 200 without re-applying side
    // effects to the tenant state.
    const stripeCreatedAt = event.created ? new Date(event.created * 1000).toISOString() : null;
    const { data: insertedEvent, error: idempotencyError } = await supabase
      .from('stripe_events')
      .insert({
        id: event.id,
        type: event.type,
        stripe_created_at: stripeCreatedAt,
      })
      .select('id')
      .maybeSingle();

    if (idempotencyError && idempotencyError.code !== '23505') {
      logger.error('Failed to record Stripe event for idempotency', idempotencyError, {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!insertedEvent) {
      logger.info('Stripe event already processed, skipping', {
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json({ received: true, idempotent: true });
    }

    // This request inserted the idempotency row; remember it for rollback on throw.
    recordedEventId = event.id;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan;
        const billingInterval = session.metadata?.billing_interval;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (tenantId) {
          // Idempotency: skip if tenant already has this subscription ID
          const { data: existingTenant, error: existingTenantError } =
            await selectTolerantToMissingFreezeReason(
              // CTR-1: le statut de depart est necessaire pour appliquer la regle
              // du fichier (voir isEntitlingWithoutPayment).
              // CTR7-1: les deux verrous humains, pour ne jamais rendre l'acces a
              // un tenant suspendu ou supprime par la plateforme.
              // CTR7-2: la cause courante, pour ne pas l'ecraser.
              'stripe_subscription_id, subscription_status, suspended_at, deleted_at, freeze_reason',
              (columns) =>
                supabase.from('tenants').select(columns).eq('id', tenantId).single<{
                  stripe_subscription_id: string | null;
                  subscription_status: string | null;
                  suspended_at?: string | null;
                  deleted_at?: string | null;
                  freeze_reason?: string | null;
                }>(),
              { tenantId, handler: 'checkout.session.completed' },
            );

          // B-4: ce gestionnaire etait le SEUL des quatre a jeter l'erreur de
          // lecture. `existingTenant` valait alors `undefined`, donc
          // `isActiveUnlessLocked(statut, undefined)` ne voyait AUCUN verrou et
          // ecrivait `is_active = true` sur un tenant suspendu ou supprime par
          // la plateforme - l'inverse exact de ce que la ligne qui l'appelle
          // promet. La garde "statut non sain" devenait elle aussi inoperante,
          // `isHealthySubscriptionStatus(undefined)` etant faux.
          //
          // Les trois autres gestionnaires se contentent de `break` parce
          // qu'ils n'ont rien a perdre: aucun premier paiement ne depend d'eux.
          // Celui-ci, oui (CTR7-3). Comme pour l'abonnement illisible: on
          // n'ecrit rien, on retire la ligne d'idempotence et on renvoie 500,
          // pour que Stripe rejoue a partir d'une ligne intacte.
          if (existingTenantError) {
            // R10-2: distinguer l'illisible du INTROUVABLE. `.single()` sur zero
            // ligne rend PGRST116, et c'est une condition PERMANENTE: le tenant
            // a ete supprime, ou l'identifiant porte par la session est faux.
            // Rejouer n'y changera rien, donc un 500 ferait rejouer Stripe
            // pendant trois jours pour un evenement qui ne reussira jamais - et
            // un endpoint qui echoue sans cesse finit DESACTIVE par Stripe,
            // ce qui ferait perdre les evenements de TOUS les autres clients.
            // C'est le meme raisonnement que le `break` du gestionnaire de
            // litige plus bas. Un echec transitoire, lui, reste rejouable.
            const isTenantMissing =
              typeof existingTenantError === 'object' &&
              existingTenantError !== null &&
              (existingTenantError as { code?: string }).code === 'PGRST116';

            if (isTenantMissing) {
              logger.error(
                'checkout.session.completed: tenant introuvable, evenement consomme',
                existingTenantError,
                { tenantId },
              );
              break;
            }

            logger.error(
              'checkout.session.completed: ligne tenant illisible, aucun acces accorde',
              existingTenantError,
              { tenantId },
            );
            await supabase.from('stripe_events').delete().eq('id', event.id);
            return NextResponse.json({ error: 'Tenant row unreadable' }, { status: 500 });
          }

          if (existingTenant?.stripe_subscription_id === subscriptionId) {
            logger.info('checkout.session.completed already processed, skipping', {
              tenantId,
              subscriptionId,
            });
            break;
          }

          // CTR-1: le defaut etait 'active'. Si la lecture chez Stripe echouait
          // - timeout, 429 - ce defaut partait en base avec is_active=true et
          // past_due_since=null, SANS qu'aucun etat n'ait ete lu: fail-OPEN,
          // l'inverse exact du fail-closed de charge.dispute.closed. `null` ici
          // signifie "etat non etabli", et on n'ecrit alors aucun acces.
          let mappedStatus: SubscriptionStatus | null = null;
          let subscriptionUnreadable = false;
          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              mappedStatus = mapStripeStatus(subscription.status);
            } catch (err) {
              subscriptionUnreadable = true;
              logger.error(
                'Abonnement illisible chez Stripe: aucun acces accorde (fail-closed)',
                err,
                { tenantId, subscriptionId },
              );
            }
          } else {
            logger.warn('checkout.session.completed sans abonnement: aucun acces accorde', {
              tenantId,
            });
          }

          // CTR7-3: le fail-closed de ce gestionnaire etait TERMINAL. Le `catch`
          // avalait l'echec, la route renvoyait 200, Stripe ne rejouait donc
          // JAMAIS l'evenement du PREMIER paiement - et comme
          // `stripe_subscription_id` etait quand meme ecrit, la garde
          // d'idempotence ci-dessus bloquait toute retentative. Un tenant gele
          // qui payait pendant un 429 de l'API Stripe restait eteint jusqu'au
          // roulement de periode: un mois, un an sur une formule annuelle.
          // `invoice.paid` ne peut rien rattraper (scope `past_due`).
          //
          // Un echec de LECTURE est transitoire: on n'ecrit rien du tout, on
          // retire la ligne d'idempotence et on renvoie 500 pour que Stripe
          // rejoue (trois jours). Aucun acces n'est accorde en aveugle, et le
          // rejeu repart d'une ligne intacte. Le risque "endpoint desactive par
          // Stripe" suppose un taux d'echec DURABLE de son propre API, pas un
          // 429 isole - et il est preferable a la perte definitive du premier
          // paiement. La session SANS abonnement, elle, est une condition
          // PERMANENTE: la rejouer pendant trois jours ne servirait a rien,
          // donc elle reste en 200.
          if (subscriptionUnreadable) {
            await supabase.from('stripe_events').delete().eq('id', event.id);
            return NextResponse.json({ error: 'Subscription unreadable' }, { status: 500 });
          }

          // Mettre à jour le tenant avec les infos Stripe
          const updateData: Record<string, unknown> = {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          };

          // CTR-1: ce gestionnaire ecrivait le bloc d'acces sans AUCUNE garde,
          // depuis n'importe quel statut de depart, et de facon repetable (la
          // garde d'idempotence ci-dessus compare l'identifiant d'abonnement, et
          // une nouvelle session en cree un neuf). Comme mapStripeStatus traduit
          // le `incomplete` de Stripe en `past_due` - statut ENTITLANT - un
          // tenant gele se degelait tout seul en ouvrant une session de paiement
          // qu'il n'achevait pas, et son `past_due_since` etait EFFACE: un NULL
          // sort du filtre du cron (NULL < x vaut NULL), donc plus aucune borne.
          const blockedByDispute =
            mappedStatus === null
              ? false
              : await unsettledDisputeBlocksUnfreeze(
                  stripe,
                  customerId,
                  existingTenant,
                  isActiveUnlessLocked(mappedStatus, existingTenant),
                  null,
                );

          if (mappedStatus === null) {
            logger.warn('checkout.session.completed: statut non etabli, acces inchange', {
              tenantId,
            });
          } else if (
            isEntitlingWithoutPayment(mappedStatus) &&
            !isHealthySubscriptionStatus(existingTenant?.subscription_status)
          ) {
            logger.info('checkout.session.completed: statut non sain, acces inchange', {
              tenantId,
              currentStatus: existingTenant?.subscription_status,
              mappedStatus,
            });
          } else if (blockedByDispute) {
            // CTR7-4: un gel pour litige ne se leve pas tant qu'un litige
            // retient de l'argent, quel que soit l'evenement qui arrive.
            logger.warn('checkout.session.completed: litige non regle, acces inchange', {
              tenantId,
              mappedStatus,
            });
          } else {
            updateData.subscription_status = mappedStatus;
            // Un tenant gele (essai expire, impaye) qui souscrit REELLEMENT doit
            // retrouver sa vitrine. Sans cette ligne il payait et restait eteint.
            // CTR7-1: sauf si la plateforme l'a suspendu ou supprime.
            updateData.is_active = isActiveUnlessLocked(mappedStatus, existingTenant);
            updateData.freeze_reason = freezeReasonPreservingCause(
              mappedStatus,
              FREEZE_REASONS.STRIPE_UNPAID,
              existingTenant,
              { tenantId, handler: 'checkout.session.completed' },
            );
            // La borne d'impaye ne s'efface que sur un statut SAIN. L'effacer sur
            // un `past_due` ou un `frozen` supprimerait le compte a rebours du
            // cron sans qu'aucun paiement ne soit entre.
            if (isHealthySubscriptionStatus(mappedStatus)) {
              updateData.past_due_since = null;
            }
          }

          // Ajouter le plan si fourni (valide contre l'enum, on ignore une valeur inattendue)
          if (isValidPlan(plan)) {
            updateData.subscription_plan = plan;
          } else if (plan) {
            logger.warn('checkout.session.completed: plan invalide dans metadata, ignore', {
              tenantId,
              plan,
            });
          }

          // Ajouter l'intervalle de facturation si fourni (valide contre l'enum)
          if (isValidInterval(billingInterval)) {
            updateData.billing_interval = billingInterval;
          } else if (billingInterval) {
            logger.warn(
              'checkout.session.completed: billing_interval invalide dans metadata, ignore',
              {
                tenantId,
                billingInterval,
              },
            );
          }

          const { error: updateError } = await updateTolerantToMissingFreezeReason(
            updateData,
            (payload) => supabase.from('tenants').update(payload).eq('id', tenantId),
            { tenantId, handler: 'checkout.session.completed' },
          );

          if (updateError) {
            logger.error('DB update failed for checkout.session.completed', updateError, {
              tenantId,
              subscriptionId,
            });
            // Roll back the idempotency record so Stripe's retry reprocesses this
            // event instead of being short-circuited as already-handled.
            await supabase.from('stripe_events').delete().eq('id', event.id);
            return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
          }

          logger.info('Tenant activated via checkout', {
            tenantId,
            plan,
            billingInterval,
            subscriptionStatus: mappedStatus,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Récupérer le tenant
        // CTR7-1: `suspended_at` / `deleted_at` (verrous humains, jamais
        // defaits par un evenement Stripe). CTR7-2: `freeze_reason`, pour ne
        // pas ecraser la cause d'un gel deja en place.
        const { data: tenant, error: tenantError } = await selectTolerantToMissingFreezeReason(
          'id, subscription_status, subscription_plan, billing_interval, suspended_at, deleted_at, freeze_reason',
          (columns) =>
            supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).single<{
              id: string;
              subscription_status: string | null;
              subscription_plan: string | null;
              billing_interval: string | null;
              suspended_at?: string | null;
              deleted_at?: string | null;
              freeze_reason?: string | null;
            }>(),
          { customerId, handler: 'customer.subscription.updated' },
        );

        if (tenantError || !tenant) {
          logger.warn('Subscription updated: tenant not found', { customerId });
          break;
        }

        // Accéder aux périodes via les items
        const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start;
        const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end;

        // Mapper le statut Stripe vers le statut interne
        const mappedStatus = mapStripeStatus(subscription.status);

        const updateData: Record<string, unknown> = {};

        // RES-1: un statut entitlant sans preuve de paiement ne s'ecrit QUE
        // depuis un statut sain (voir isEntitlingWithoutPayment). Le plan, la
        // periode et l'intervalle continuent d'etre mis a jour: ce sont des
        // metadonnees, elles ne rendent aucun acces.
        const refusedByRule =
          isEntitlingWithoutPayment(mappedStatus) &&
          !isHealthySubscriptionStatus(tenant.subscription_status);

        // CTR7-4: ce gestionnaire pouvait lever un gel pour litige sur le seul
        // mot de Stripe, alors que `charge.dispute.closed` verifiait les autres
        // litiges. Meme acces, deux regles differentes selon l'evenement recu.
        const refusedByDispute =
          !refusedByRule &&
          (await unsettledDisputeBlocksUnfreeze(
            stripe,
            customerId,
            tenant,
            isActiveUnlessLocked(mappedStatus, tenant),
            null,
          ));

        if (refusedByRule || refusedByDispute) {
          logger.info('subscription.updated: acces inchange', {
            tenantId: tenant.id,
            currentStatus: tenant.subscription_status,
            mappedStatus,
            reason: refusedByRule ? 'statut non sain' : 'litige non regle',
          });
          // CTR-2: refuser le statut entrant ne doit pas faire PERDRE la
          // re-affirmation de `is_active`. L'ancien code l'ecrivait toujours;
          // la garde l'avait supprimee sur la transition past_due -> past_due,
          // et un tenant reste a `past_due` avec `is_active=false` - etat que le
          // code d'avant a pu creer en base, puisqu'il ecrivait le statut sans
          // is_active - n'avait plus aucun chemin de reparation hors paiement:
          // vitrine morte (order-queries) ET dashboard verrouille (proxy).
          //
          // La valeur se calcule sur le statut COURANT, jamais sur le statut
          // entrant: sur un tenant gele cela ecrit `false`, donc cette ligne ne
          // peut pas rendre d'acces. Le statut est garanti valide par la
          // contrainte CHECK de la colonne.
          //
          // CTR7-1: et JAMAIS a un tenant que la plateforme a suspendu ou
          // supprime. C'est cette ligne, ajoutee par CTR-2, qui rallumait un
          // tenant suspendu a chaque relance Stripe (`past_due -> past_due`):
          // `isActiveForStatus('past_due')` vaut `true`, et l'ancien code,
          // lui, ne partait meme pas en requete.
          updateData.is_active = isActiveUnlessLocked(
            tenant.subscription_status as SubscriptionStatus,
            tenant,
          );
        } else {
          updateData.subscription_status = mappedStatus;
          // is_active suit le statut dans les DEUX sens: un tenant gele qui
          // repaie doit retrouver sa vitrine, pas rester eteint en silence.
          // CTR7-1: sauf verrou humain (suspension, suppression).
          updateData.is_active = isActiveUnlessLocked(mappedStatus, tenant);
          updateData.freeze_reason = freezeReasonPreservingCause(
            mappedStatus,
            FREEZE_REASONS.STRIPE_UNPAID,
            tenant,
            { tenantId: tenant.id, handler: 'customer.subscription.updated' },
          );

          // F3: horodater l'entree en impaye pour pouvoir la BORNER. Sans cette
          // date, rien ne mesure depuis quand un tenant est en past_due, et il y
          // reste indefiniment avec son plan. On arrive forcement d'un statut
          // sain ici, donc c'est toujours la PREMIERE transition vers l'impaye:
          // le compteur ne peut plus etre remis a zero par un evenement de
          // relance. Effacee des que le tenant repasse a un statut sain.
          updateData.past_due_since = mappedStatus === 'past_due' ? new Date().toISOString() : null;
        }

        // Detect plan/interval change via price ID
        const currentPriceId = subscription.items?.data?.[0]?.price?.id;
        if (currentPriceId) {
          const detectedPlan = getPlanFromPriceId(currentPriceId);
          const detectedInterval = getIntervalFromPriceId(currentPriceId);

          if (detectedPlan && detectedPlan !== tenant.subscription_plan) {
            updateData.subscription_plan = detectedPlan;
            logger.info('Plan change detected', {
              tenantId: tenant.id,
              oldPlan: tenant.subscription_plan,
              newPlan: detectedPlan,
            });
          }

          if (detectedInterval && detectedInterval !== tenant.billing_interval) {
            updateData.billing_interval = detectedInterval;
          }
        }

        // Fallback: detect billing interval from Stripe subscription interval
        if (!updateData.billing_interval) {
          const detectedInterval = detectBillingInterval(subscription);
          if (detectedInterval !== tenant.billing_interval) {
            updateData.billing_interval = detectedInterval;
          }
        }

        if (currentPeriodStart) {
          updateData.subscription_current_period_start = new Date(
            currentPeriodStart * 1000,
          ).toISOString();
        }
        if (currentPeriodEnd) {
          updateData.subscription_current_period_end = new Date(
            currentPeriodEnd * 1000,
          ).toISOString();
        }

        // Le court-circuit sur un payload vide a disparu avec CTR-2: les deux
        // branches ecrivent desormais au moins `is_active`, il etait devenu
        // inatteignable.
        const { error: updateError } = await updateTolerantToMissingFreezeReason(
          updateData,
          (payload) => supabase.from('tenants').update(payload).eq('id', tenant.id),
          { tenantId: tenant.id, handler: 'customer.subscription.updated' },
        );

        if (updateError) {
          logger.error('DB update failed for customer.subscription.updated', updateError, {
            tenantId: tenant.id,
            stripeStatus: subscription.status,
          });
          // Roll back the idempotency record so Stripe's retry reprocesses.
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.info('Subscription updated', {
          tenantId: tenant.id,
          stripeStatus: subscription.status,
          mappedStatus,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Geler le tenant
        const { data: tenant, error: tenantDeleteError } = await supabase
          .from('tenants')
          .select('id, subscription_status')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantDeleteError || !tenant) {
          logger.warn('Subscription deleted: tenant not found', { customerId });
          break;
        }

        // Idempotency: skip if tenant is already frozen
        if (tenant.subscription_status === 'frozen') {
          logger.info('customer.subscription.deleted already processed, skipping', {
            tenantId: tenant.id,
          });
          break;
        }

        const { error: updateError } = await updateTolerantToMissingFreezeReason(
          {
            subscription_status: 'frozen',
            is_active: false,
            // La cause du gel: un litige gagne ne doit pas lever CE gel-la.
            freeze_reason: FREEZE_REASONS.SUBSCRIPTION_DELETED,
          },
          (payload) => supabase.from('tenants').update(payload).eq('id', tenant.id),
          { tenantId: tenant.id, handler: 'customer.subscription.deleted' },
        );

        if (updateError) {
          logger.error('DB update failed for customer.subscription.deleted', updateError, {
            tenantId: tenant.id,
          });
          // Roll back the idempotency record so Stripe's retry reprocesses.
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.warn('Tenant frozen - subscription deleted', { tenantId: tenant.id });
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Stripe sends this 3 days before trial ends
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantError || !tenant) {
          logger.warn('Trial will end: tenant not found', { customerId });
          break;
        }

        // Mark trial warning so UI can display urgent banner
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ trial_warning_sent: true })
          .eq('id', tenant.id);

        if (updateError) {
          logger.error('DB update failed for trial_will_end', updateError, {
            tenantId: tenant.id,
          });
          break;
        }

        logger.info('Trial ending soon, warning sent', { tenantId: tenant.id });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Marquer comme "past_due"
        const { data: tenant, error: tenantPaymentError } = await supabase
          .from('tenants')
          // CTR7-1: ce gestionnaire ecrit `is_active: true` ('past_due' est
          // entitlant). Il ne figurait dans AUCUNE liste d'ecrivains de
          // `is_active`, et un impaye sur un tenant suspendu encore `active`
          // chez Stripe rallumait donc l'acces - un ECHEC de paiement rendait
          // le service. Les verrous humains sont lus ici aussi.
          .select('id, subscription_status, suspended_at, deleted_at')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenantPaymentError || !tenant) {
          logger.warn('Payment failed: tenant not found', { customerId });
          break;
        }

        // ACT-19: n'appliquer 'past_due' QUE depuis un statut SAIN - la regle
        // commune a ce gestionnaire et a customer.subscription.updated, portee
        // par isEntitlingWithoutPayment / isHealthySubscriptionStatus.
        //
        // La garde ne testait que 'past_due' (idempotence). Or 'past_due' est
        // ENTITLANT (voir isSubscriptionUsable): l'ecrire sur un tenant 'frozen',
        // 'cancelled' ou 'paused' faisait d'un IMPAYE un ticket de reouverture
        // d'acces - un litige, une resiliation ou un essai expire etaient effaces
        // par l'echec de paiement suivant.
        if (!isHealthySubscriptionStatus(tenant.subscription_status)) {
          logger.info('invoice.payment_failed: statut non sain, aucune ecriture', {
            tenantId: tenant.id,
            currentStatus: tenant.subscription_status,
          });
          break;
        }

        const { error: updateError } = await updateTolerantToMissingFreezeReason(
          {
            subscription_status: 'past_due',
            // Ce gestionnaire etait le SEUL a ne pas reecrire is_active: il
            // laissait un statut entitlant avec une vitrine eteinte, l'etat
            // exact qui a deja casse des clients payants (voir isActiveForStatus).
            is_active: isActiveUnlessLocked('past_due', tenant),
            // On arrive forcement d'un statut sain: c'est donc la PREMIERE
            // transition vers l'impaye. Sans cette date, le cron de gel ne peut
            // pas borner l'impaye et le tenant garde son plan sans limite.
            past_due_since: new Date().toISOString(),
            // `past_due` n'est pas un gel: la cause s'efface. C'est cet
            // effacement systematique qui garantit qu'aucun gel futur ne
            // heritera d'une cause posee par un gel precedent.
            freeze_reason: null,
          },
          (payload) => supabase.from('tenants').update(payload).eq('id', tenant.id),
          { tenantId: tenant.id, handler: 'invoice.payment_failed' },
        );

        if (updateError) {
          logger.error('DB update failed for invoice.payment_failed', updateError, {
            tenantId: tenant.id,
          });
          // Roll back the idempotency record so Stripe's retry reprocesses.
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.warn('Payment failed for tenant', { tenantId: tenant.id });
        break;
      }

      case 'invoice.payment_action_required': {
        // 3D Secure or other payment action required
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logger.info('Payment action required', {
          customerId,
          invoiceId: invoice.id,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        });
        break;
      }

      // F10: un chargeback ne declenchait AUCUNE action. Le client contestait le
      // prelevement, recuperait son argent, et gardait son acces pendant le
      // litige comme apres. Le tenant est gele des l'ouverture du litige - c'est
      // reversible: si le litige est gagne, le case ci-dessous le degele.
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const customerId = await disputeCustomerId(stripe, dispute);

        if (!customerId) {
          logger.warn('Dispute created without resolvable customer', { disputeId: dispute.id });
          break;
        }

        // CTR7-2: ce gestionnaire ecrivait `freeze_reason = 'dispute'` SANS
        // aucune lecture ni garde de statut, donc PAR-DESSUS la cause d'un gel
        // deja en place (un impaye depasse gele par le cron, par exemple). Le
        // gel du cron devenait alors un gel que `charge.dispute.closed` avait
        // le droit de lever. Un tenant DEJA gele n'a rien a geler de plus: on
        // se contente de re-affirmer la coupure d'acces, sans toucher a la
        // cause. `customer.subscription.deleted` lit deja la ligne de la meme
        // facon.
        const { data: disputeTenant, error: disputeReadError } =
          await selectTolerantToMissingFreezeReason(
            'id, subscription_status, freeze_reason',
            (columns) =>
              supabase
                .from('tenants')
                .select(columns)
                .eq('stripe_customer_id', customerId)
                .maybeSingle<{
                  id: string;
                  subscription_status: string | null;
                  freeze_reason?: string | null;
                }>(),
            { customerId, disputeId: dispute.id, handler: 'charge.dispute.created' },
          );

        let freezePayload: Record<string, unknown>;
        let applyFreeze: (payload: Record<string, unknown>) => PromiseLike<{ error: unknown }>;

        if (disputeReadError || !disputeTenant) {
          // Ligne illisible (echec transitoire, ou DEUX tenants partageant le
          // meme client Stripe: `maybeSingle` rend alors une erreur). Le gel ne
          // doit JAMAIS etre saute - l'argent est en jeu - mais on ne peut pas
          // affirmer une cause qu'on n'a pas lue: on gele sans ecrire de cause.
          // Une cause deja presente survit donc, et un gel sans cause ne se
          // leve pas tout seul: les deux directions sont sures.
          logger.warn('Dispute created: ligne tenant illisible, gel sans cause', {
            customerId,
            disputeId: dispute.id,
          });
          freezePayload = { subscription_status: 'frozen', is_active: false };
          applyFreeze = (payload) =>
            supabase.from('tenants').update(payload).eq('stripe_customer_id', customerId);
        } else if (keepsExistingFreezeCause(disputeTenant)) {
          logger.info('Dispute created: tenant deja gele, cause existante conservee', {
            tenantId: disputeTenant.id,
            disputeId: dispute.id,
            keptReason: disputeTenant.freeze_reason ?? null,
          });
          freezePayload = { is_active: false };
          applyFreeze = (payload) =>
            supabase.from('tenants').update(payload).eq('id', disputeTenant.id);
        } else {
          freezePayload = {
            subscription_status: 'frozen',
            is_active: false,
            // La cause: c'est le SEUL gel que charge.dispute.closed peut lever.
            freeze_reason: FREEZE_REASONS.DISPUTE,
          };
          applyFreeze = (payload) =>
            supabase.from('tenants').update(payload).eq('id', disputeTenant.id);
        }

        const { error: disputeError } = await updateTolerantToMissingFreezeReason(
          freezePayload,
          applyFreeze,
          { customerId, disputeId: dispute.id, handler: 'charge.dispute.created' },
        );

        if (disputeError) {
          logger.error('Dispute freeze failed', disputeError);
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.warn('Tenant frozen after chargeback', { customerId, disputeId: dispute.id });
        break;
      }

      case 'charge.dispute.closed': {
        // Le degel n'est PAS automatique quand le litige est perdu: l'argent est
        // parti, le tenant reste gele jusqu'a regularisation. Il ne l'est que si
        // le litige est gagne ('won'), c'est-a-dire si le paiement tient.
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.status !== 'won') {
          logger.warn('Dispute closed against us, tenant stays frozen', {
            disputeId: dispute.id,
            status: dispute.status,
          });
          break;
        }

        const customerId = await disputeCustomerId(stripe, dispute);

        if (!customerId) break;

        // ACT-18: 'frozen' est l'etat de gel GENERIQUE du projet. Il est pose
        // par ce litige, mais aussi par customer.subscription.deleted, par le
        // cron des essais expires, par le cron des impayes depasses et par un
        // statut Stripe impaye. Ecrire 'active' sur tout tenant gele rendait
        // donc un plan payant ACTIF a un tenant que Stripe ne couvre plus, sans
        // abonnement derriere et sans borne de temps.
        //
        // Ce gestionnaire ne leve plus qu'un gel dont il est LUI-MEME la cause,
        // et seulement si Stripe confirme que l'abonnement est paye. Deux
        // conditions, aucune des deux suffisante:
        //   1. `freeze_reason === 'dispute'` - quel gel on a le droit de lever;
        //   2. l'etat relu chez Stripe - si cet acces est paye.
        const { data: tenant, error: disputeTenantError } =
          await selectTolerantToMissingFreezeReason(
            // CTR7-1: les verrous humains sont lus ici aussi - un litige gagne
            // ne rallume pas un tenant que la plateforme a coupe.
            'id, subscription_status, stripe_subscription_id, freeze_reason, suspended_at, deleted_at',
            (columns) =>
              supabase
                .from('tenants')
                .select(columns)
                .eq('stripe_customer_id', customerId)
                .maybeSingle<{
                  id: string;
                  subscription_status: string;
                  stripe_subscription_id: string | null;
                  freeze_reason?: string | null;
                  suspended_at?: string | null;
                  deleted_at?: string | null;
                }>(),
            { customerId, disputeId: dispute.id, handler: 'charge.dispute.closed' },
          );

        if (disputeTenantError || !tenant) {
          logger.warn('Dispute closed: tenant introuvable', { customerId, disputeId: dispute.id });
          break;
        }

        // Le gel a pu etre leve entre-temps (paiement, nouvelle souscription):
        // rien a degeler, et surtout rien a reecrire par-dessus.
        if (tenant.subscription_status !== 'frozen') {
          logger.info('Dispute closed: tenant non gele, aucune ecriture', {
            tenantId: tenant.id,
            currentStatus: tenant.subscription_status,
          });
          break;
        }

        // La cause, premiere condition. Colonne absente (le code part en
        // production AVANT la migration) ou cause inconnue: on ne leve rien.
        // C'est la direction sure, et c'est ce qui rend le dispositif robuste a
        // un chemin de gel futur qui oublierait d'ecrire sa cause.
        if (tenant.freeze_reason !== FREEZE_REASONS.DISPUTE) {
          logger.info('Dispute closed: le gel n a pas pour cause un litige, aucune ecriture', {
            tenantId: tenant.id,
            freezeReason: tenant.freeze_reason ?? null,
            disputeId: dispute.id,
          });
          break;
        }

        if (!tenant.stripe_subscription_id) {
          // Essai expire gele par le cron, ou tenant sans abonnement: aucun
          // abonnement ne paie cet acces, le litige gagne n'y change rien.
          logger.warn('Dispute gagne mais aucun abonnement Stripe: le tenant reste gele', {
            tenantId: tenant.id,
            disputeId: dispute.id,
          });
          break;
        }

        let restoredStatus: SubscriptionStatus;
        try {
          const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
          restoredStatus = mapStripeStatus(subscription.status);
        } catch (err) {
          // Fail-closed: sans etat verifie, on ne rend pas l'acces. On ne fait
          // pas echouer la requete pour autant - un endpoint durablement en
          // erreur finit DESACTIVE par Stripe, ce qui ferait perdre les
          // evenements d'activation de TOUS les clients.
          logger.error('Dispute gagne mais abonnement illisible: le tenant reste gele', err, {
            tenantId: tenant.id,
            disputeId: dispute.id,
          });
          break;
        }

        // Seconde relecture, et seulement quand l'ecriture RENDRAIT l'acces:
        // deux litiges simultanes portent la meme cause, donc gagner le premier
        // ne doit pas rallumer le tenant tant que le second retient de l'argent.
        // Meme helper que les deux autres gestionnaires (CTR7-4).
        if (
          await unsettledDisputeBlocksUnfreeze(
            stripe,
            customerId,
            tenant,
            isActiveUnlessLocked(restoredStatus, tenant),
            dispute.id,
          )
        ) {
          logger.warn('Dispute gagne mais un litige n est pas regle ou est illisible: gele', {
            tenantId: tenant.id,
            disputeId: dispute.id,
          });
          break;
        }

        const unfreezeData: Record<string, unknown> = {
          subscription_status: restoredStatus,
          // CTR7-1: une suspension plateforme survit a un litige gagne.
          is_active: isActiveUnlessLocked(restoredStatus, tenant),
          // Le statut restaure peut etre un AUTRE gel (Stripe dit 'unpaid'): la
          // cause suit alors ce gel-la, elle ne reste pas a 'dispute'.
          freeze_reason: freezeReasonForStatus(restoredStatus, FREEZE_REASONS.STRIPE_UNPAID),
        };

        // RES-2c: un statut SAIN restaure efface la date d'entree en impaye,
        // comme le font checkout.session.completed et invoice.paid. A l'inverse,
        // un 'past_due' restaure la GARDE intacte: c'est cette date ancienne qui
        // borne la limite assumee de ce gestionnaire (rendre l'acces a un gel
        // pour impaye que Stripe dit encore 'past_due'), en laissant le cron
        // regeler le tenant au prochain passage.
        if (isHealthySubscriptionStatus(restoredStatus)) {
          unfreezeData.past_due_since = null;
        }

        const { error: unfreezeError } = await updateTolerantToMissingFreezeReason(
          unfreezeData,
          (payload) =>
            supabase
              .from('tenants')
              .update(payload)
              .eq('id', tenant.id)
              // Garde optimiste: la ligne a pu changer depuis la lecture.
              .eq('subscription_status', 'frozen'),
          { tenantId: tenant.id, disputeId: dispute.id, handler: 'charge.dispute.closed' },
        );

        if (unfreezeError) {
          logger.error('Dispute unfreeze failed', unfreezeError);
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.info('Litige gagne: statut realigne sur l abonnement Stripe', {
          tenantId: tenant.id,
          disputeId: dispute.id,
          restoredStatus,
        });
        break;
      }

      // F10: filet idempotent. Si un customer.subscription.updated se perd, une
      // facture payee suffit a prouver que l'abonnement est sain - sans elle, un
      // tenant pouvait rester en past_due alors qu'il avait paye.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { error: paidError } = await updateTolerantToMissingFreezeReason(
          {
            subscription_status: 'active',
            past_due_since: null,
            is_active: true,
            // Sortie d'impaye: aucune cause de gel ne doit survivre.
            freeze_reason: null,
          },
          (payload) =>
            supabase
              .from('tenants')
              .update(payload)
              .eq('stripe_customer_id', customerId)
              // 'frozen' est volontairement EXCLU: un gel pour litige
              // (chargeback) ne doit pas etre leve par la facture du mois
              // suivant. Seul un impaye regularise se recupere ici; un litige se
              // resout par dispute.closed.
              .eq('subscription_status', 'past_due')
              // CTR7-1: ce gestionnaire n'a aucune lecture prealable (filet
              // idempotent volontairement minimal), donc la garde ne peut etre
              // qu'un filtre d'ecriture. Son payload est EXCLUSIVEMENT un bloc
              // d'acces: rien n'est perdu a ne pas l'appliquer a un tenant que
              // la plateforme a coupe. Une facture payee ne leve pas une
              // suspension - seul `unsuspendTenant` le fait.
              .is('suspended_at', null)
              .is('deleted_at', null),
          { customerId, handler: 'invoice.paid' },
        );

        if (paidError) {
          logger.error('invoice.paid recovery failed', paidError);
          await supabase.from('stripe_events').delete().eq('id', event.id);
          return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
        }

        logger.info('Invoice paid, subscription state reconciled', { customerId });
        break;
      }

      default:
        logger.info('Unhandled Stripe event type', { eventType: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    logger.error('Webhook error', error);
    // Roll back the idempotency record on a thrown failure so Stripe's retry can
    // reprocess (mirrors the explicit updateError paths). Uses a fresh admin
    // client because the in-try one is out of scope here.
    if (recordedEventId) {
      try {
        await createAdminClient().from('stripe_events').delete().eq('id', recordedEventId);
      } catch (rollbackErr) {
        logger.error('Failed to roll back Stripe idempotency record', rollbackErr, {
          eventId: recordedEventId,
        });
      }
    }
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
