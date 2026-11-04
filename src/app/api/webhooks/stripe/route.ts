import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getStripe, getPlanFromPriceId, getIntervalFromPriceId } from '@/lib/stripe/server';
import { isSubscriptionUsable } from '@/lib/plans/features';
import {
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

/** Statuts d'un litige encore OUVERT chez Stripe (argent toujours en jeu). */
const OPEN_DISPUTE_STATUSES: readonly string[] = ['needs_response', 'under_review'];

/**
 * Reste-t-il un litige OUVERT pour ce client, autre que celui qu'on ferme ?
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
 * porte sur les 100 derniers paiements du client. Un litige rattache a un
 * paiement plus ancien n'est pas vu. Le verrou principal reste la cause du gel.
 *
 * Cout: un appel, plus un par paiement effectivement conteste - en pratique zero
 * ou un. On passe par `charges.list` parce que `disputes.list` ne sait pas
 * filtrer par client.
 */
async function hasOpenDispute(
  stripe: ReturnType<typeof getStripe>,
  customerId: string,
  closingDisputeId: string,
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
        if (other.id === closingDisputeId) continue;
        if (OPEN_DISPUTE_STATUSES.includes(other.status)) {
          logger.warn('Un autre litige est encore ouvert: le tenant reste gele', {
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
          const { data: existingTenant } = await supabase
            .from('tenants')
            // CTR-1: le statut de depart est necessaire pour appliquer la regle
            // du fichier (voir isEntitlingWithoutPayment).
            .select('stripe_subscription_id, subscription_status')
            .eq('id', tenantId)
            .single();

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
          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              mappedStatus = mapStripeStatus(subscription.status);
            } catch (err) {
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
          } else {
            updateData.subscription_status = mappedStatus;
            // Un tenant gele (essai expire, impaye) qui souscrit REELLEMENT doit
            // retrouver sa vitrine. Sans cette ligne il payait et restait eteint.
            updateData.is_active = isActiveForStatus(mappedStatus);
            updateData.freeze_reason = freezeReasonForStatus(
              mappedStatus,
              FREEZE_REASONS.STRIPE_UNPAID,
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
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, subscription_status, subscription_plan, billing_interval')
          .eq('stripe_customer_id', customerId)
          .single();

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
        if (
          isEntitlingWithoutPayment(mappedStatus) &&
          !isHealthySubscriptionStatus(tenant.subscription_status)
        ) {
          logger.info('subscription.updated: statut non sain, acces inchange', {
            tenantId: tenant.id,
            currentStatus: tenant.subscription_status,
            mappedStatus,
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
          updateData.is_active = isActiveForStatus(
            tenant.subscription_status as SubscriptionStatus,
          );
        } else {
          updateData.subscription_status = mappedStatus;
          // is_active suit le statut dans les DEUX sens: un tenant gele qui
          // repaie doit retrouver sa vitrine, pas rester eteint en silence.
          updateData.is_active = isActiveForStatus(mappedStatus);
          updateData.freeze_reason = freezeReasonForStatus(
            mappedStatus,
            FREEZE_REASONS.STRIPE_UNPAID,
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
          .select('id, subscription_status')
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
            is_active: isActiveForStatus('past_due'),
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

        const { error: disputeError } = await updateTolerantToMissingFreezeReason(
          {
            subscription_status: 'frozen',
            is_active: false,
            // La cause: c'est le SEUL gel que charge.dispute.closed peut lever.
            freeze_reason: FREEZE_REASONS.DISPUTE,
          },
          (payload) =>
            supabase.from('tenants').update(payload).eq('stripe_customer_id', customerId),
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
            'id, subscription_status, stripe_subscription_id, freeze_reason',
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
        if (isActiveForStatus(restoredStatus)) {
          const openDispute = await hasOpenDispute(stripe, customerId, dispute.id);
          if (openDispute !== false) {
            // `true` (litige ouvert) comme `null` (etat illisible): on reste
            // gele. Sans etat etabli, on ne rend pas l'acces.
            logger.warn('Dispute gagne mais un litige reste ouvert ou illisible: tenant gele', {
              tenantId: tenant.id,
              disputeId: dispute.id,
            });
            break;
          }
        }

        const unfreezeData: Record<string, unknown> = {
          subscription_status: restoredStatus,
          is_active: isActiveForStatus(restoredStatus),
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
              .eq('subscription_status', 'past_due'),
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
