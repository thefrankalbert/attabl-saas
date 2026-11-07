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
import { unsettledDisputeBlocksUnfreeze } from './disputes';
import {
  detectBillingInterval,
  freezeReasonPreservingCause,
  isActiveUnlessLocked,
  isEntitlingWithoutPayment,
  isHealthySubscriptionStatus,
  mapStripeStatus,
  refundFreezeBlocksUnfreeze,
} from './status';

/**
 * Le cycle de vie de l'abonnement tel que Stripe le raconte: modifie, supprime,
 * essai bientot termine.
 */

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
    return;
  }

  // Acceder aux periodes via les items
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
      stripeStatus: subscription.status,
    });
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.info('Subscription updated', {
    tenantId: tenant.id,
    stripeStatus: subscription.status,
    mappedStatus,
  });
}

export async function handleSubscriptionDeleted(
  { supabase }: StripeWebhookDeps,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string;

  // Geler le tenant
  const { data: tenant, error: tenantDeleteError } = await supabase
    .from('tenants')
    .select('id, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single();

  if (tenantDeleteError || !tenant) {
    logger.warn('Subscription deleted: tenant not found', { customerId });
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
