import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { getPlanFromPriceId, getIntervalFromPriceId } from '@/lib/stripe/server';
import {
  FREEZE_REASONS,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { ServiceError } from '../errors';
import type { SubscriptionStatus } from '@/types/billing';
import type { StripeWebhookDeps } from './deps';
import { lireEtatReel, remplacantVerifie } from './etat-stripe';
import { unsettledDisputeBlocksUnfreeze } from './disputes';
import {
  detectBillingInterval,
  freezeReasonPreservingCause,
  isActiveUnlessLocked,
  isEntitlingWithoutPayment,
  isHealthySubscriptionStatus,
  mapStripeStatus,
  refundFreezeBlocksUnfreeze,
  remplacantDesigne,
} from './status';

/**
 * Le cycle de vie de l'abonnement tel que Stripe le raconte: modifie, supprime,
 * essai bientot termine.
 */

/**
 * Intrusion M-02: l'evenement concerne-t-il un AUTRE abonnement que celui du
 * restaurant ?
 *
 * Le restaurant etait retrouve par son client Stripe seul. Un evenement tardif
 * d'un ancien abonnement, ou d'un abonnement en double sur le meme client,
 * ecrivait donc l'etat du restaurant: la suppression de l'ancien gelait un
 * restaurant qui paie. Un restaurant sans abonnement enregistre (`null`)
 * accepte l'evenement: c'est le cas du tout premier, avant que
 * `checkout.session.completed` n'ecrive l'identifiant. Quand l'identifiant
 * differe, `checkout.session.completed` reste le seul a pouvoir le remplacer,
 * et il relit lui-meme l'etat chez Stripe.
 */
function concerneUnAutreAbonnement(
  tenant: { stripe_subscription_id?: string | null },
  subscriptionId: string,
): boolean {
  return Boolean(tenant.stripe_subscription_id) && tenant.stripe_subscription_id !== subscriptionId;
}

export async function handleSubscriptionUpdated(
  { supabase, stripe }: StripeWebhookDeps,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;

  // Recuperer le tenant
  // CTR7-1: `suspended_at` / `deleted_at` (verrous humains, jamais
  // defaits par un evenement Stripe). CTR7-2: `freeze_reason`, pour ne
  // pas ecraser la cause d'un gel deja en place.
  const { data: tenant, error: tenantError } = await selectTolerantToMissingFreezeReason(
    'id, subscription_status, subscription_plan, billing_interval, stripe_subscription_id, suspended_at, deleted_at, freeze_reason',
    (columns) =>
      supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).single<{
        id: string;
        subscription_status: string | null;
        subscription_plan: string | null;
        billing_interval: string | null;
        stripe_subscription_id?: string | null;
        suspended_at?: string | null;
        deleted_at?: string | null;
        freeze_reason?: string | null;
      }>(),
    { customerId, handler: 'customer.subscription.updated' },
  );

  if (tenantError || !tenant) {
    logger.warn('Subscription updated: tenant not found', { customerId });
    return;
  }

  if (concerneUnAutreAbonnement(tenant, subscription.id)) {
    logger.warn('subscription.updated ignore: ce n est pas l abonnement courant du restaurant', {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
    });
    return;
  }

  // Intrusion M-05: Stripe ne garantit pas l'ordre de livraison. Un evenement
  // perime ecrivait son contenu tel quel: un "impaye" livre apres le "paye"
  // remettait en impaye un restaurant qui venait de payer, et un ancien prix
  // livre apres un changement de formule paye rendait l'ancienne formule.
  //
  // Tout ce gestionnaire travaille donc sur l'etat REEL de l'abonnement, relu
  // chez Stripe, et non sur le contenu de l'evenement: statut, prix, periode
  // et intervalle viennent du meme objet, a jour. L'evenement ne sert plus
  // que de signal "quelque chose a change".
  const etat = await lireEtatReel(stripe, subscription, tenant.id);

  // Acceder aux periodes via les items
  const currentPeriodStart = etat.items?.data?.[0]?.current_period_start;
  const currentPeriodEnd = etat.items?.data?.[0]?.current_period_end;

  // Mapper le statut Stripe vers le statut interne
  const mappedStatus = mapStripeStatus(etat.status);

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
  // Un gel pour remboursement ne se leve pas sur le simple mot de Stripe: un
  // remboursement ne change pas le statut de l'abonnement, donc sans ce refus
  // le prochain evenement d'abonnement rendait l'acces sans aucun paiement.
  const refusedByRefund = !refusedByRule && refundFreezeBlocksUnfreeze(tenant);

  const refusedByDispute =
    !refusedByRule &&
    !refusedByRefund &&
    (await unsettledDisputeBlocksUnfreeze(
      stripe,
      customerId,
      tenant,
      isActiveUnlessLocked(mappedStatus, tenant),
      null,
    ));

  if (refusedByRule || refusedByRefund || refusedByDispute) {
    logger.info('subscription.updated: acces inchange', {
      tenantId: tenant.id,
      currentStatus: tenant.subscription_status,
      mappedStatus,
      reason: refusedByRule
        ? 'statut non sain'
        : refusedByRefund
          ? 'gel pour remboursement: pas de paiement neuf'
          : 'litige non regle',
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
  const currentPriceId = etat.items?.data?.[0]?.price?.id;
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
    const detectedInterval = detectBillingInterval(etat);
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
    updateData.subscription_current_period_end = new Date(currentPeriodEnd * 1000).toISOString();
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
      stripeStatus: etat.status,
    });
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.info('Subscription updated', {
    tenantId: tenant.id,
    stripeStatus: etat.status,
    mappedStatus,
  });
}

export async function handleSubscriptionDeleted(
  { supabase, stripe }: StripeWebhookDeps,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;

  // Geler le tenant
  const { data: tenant, error: tenantDeleteError } = await supabase
    .from('tenants')
    .select('id, subscription_status, stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (tenantDeleteError || !tenant) {
    logger.warn('Subscription deleted: tenant not found', { customerId });
    return;
  }

  // Cet abonnement a ete annule par NOUS parce qu'un autre, paye, le remplace
  // (filet contre le double abonnement). Ce n'est pas une resiliation: geler
  // ici couperait le restaurant qui vient de payer, et effacer l'identifiant
  // ferait echouer l'enregistrement du nouveau. Le remplacant est VERIFIE
  // chez Stripe: la marque seule peut etre tapee par le client.
  const remplacant = remplacantDesigne(subscription);
  if (remplacant && (await remplacantVerifie(stripe, remplacant, tenant.id))) {
    logger.info('subscription.deleted ignore: abonnement remplace par un autre', {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      remplacant,
    });
    return;
  }

  if (concerneUnAutreAbonnement(tenant, subscription.id)) {
    logger.warn('subscription.deleted ignore: ce n est pas l abonnement courant du restaurant', {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
    });
    return;
  }

  // Idempotency: skip if tenant is already frozen
  if (tenant.subscription_status === 'frozen') {
    logger.info('customer.subscription.deleted already processed, skipping', {
      tenantId: tenant.id,
    });
    return;
  }

  const { error: updateError } = await updateTolerantToMissingFreezeReason(
    {
      subscription_status: 'frozen',
      is_active: false,
      // La cause du gel: un litige gagne ne doit pas lever CE gel-la.
      freeze_reason: FREEZE_REASONS.SUBSCRIPTION_DELETED,
      // L'abonnement n'existe plus: son identifiant ne doit pas rester. Avec la
      // garde M-02, un identifiant perime ferait ignorer a vie les evenements
      // d'un abonnement recree hors du parcours de paiement.
      stripe_subscription_id: null,
    },
    (payload) => supabase.from('tenants').update(payload).eq('id', tenant.id),
    { tenantId: tenant.id, handler: 'customer.subscription.deleted' },
  );

  if (updateError) {
    logger.error('DB update failed for customer.subscription.deleted', updateError, {
      tenantId: tenant.id,
    });
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.warn('Tenant frozen - subscription deleted', { tenantId: tenant.id });
}

/**
 * Stripe envoie cet evenement 3 jours avant la fin de l'essai. Il ne touche NI
 * le statut NI l'acces: il pose seulement le drapeau d'affichage. Une ecriture
 * en echec ne fait donc PAS rejouer Stripe - ce serait disproportionne pour un
 * bandeau.
 */
export async function handleTrialWillEnd(
  { supabase }: StripeWebhookDeps,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (tenantError || !tenant) {
    logger.warn('Trial will end: tenant not found', { customerId });
    return;
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
    return;
  }

  logger.info('Trial ending soon, warning sent', { tenantId: tenant.id });
}
