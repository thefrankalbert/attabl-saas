import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  FREEZE_REASONS,
  freezeReasonForStatus,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { ServiceError } from '../errors';
import type { SubscriptionStatus } from '@/types/billing';
import type { StripeWebhookDeps } from './deps';
import { disputeCustomerId, unsettledDisputeBlocksUnfreeze } from './disputes';
import {
  isActiveUnlessLocked,
  isHealthySubscriptionStatus,
  keepsExistingFreezeCause,
  mapStripeStatus,
} from './status';

/**
 * Les LITIGES (chargebacks).
 *
 * F10: un chargeback ne declenchait AUCUNE action. Le client contestait le
 * prelevement, recuperait son argent, et gardait son acces pendant le litige
 * comme apres. Le tenant est gele des l'ouverture du litige - c'est reversible:
 * si le litige est gagne, la fermeture le degele.
 */

export async function handleDisputeCreated(
  { supabase, stripe }: StripeWebhookDeps,
  dispute: Stripe.Dispute,
): Promise<void> {
  const customerId = await disputeCustomerId(stripe, dispute);

  if (!customerId) {
    logger.warn('Dispute created without resolvable customer', { disputeId: dispute.id });
    return;
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
        supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).maybeSingle<{
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
    applyFreeze = (payload) => supabase.from('tenants').update(payload).eq('id', disputeTenant.id);
  } else {
    freezePayload = {
      subscription_status: 'frozen',
      is_active: false,
      // La cause: c'est le SEUL gel que charge.dispute.closed peut lever.
      freeze_reason: FREEZE_REASONS.DISPUTE,
    };
    applyFreeze = (payload) => supabase.from('tenants').update(payload).eq('id', disputeTenant.id);
  }

  const { error: disputeError } = await updateTolerantToMissingFreezeReason(
    freezePayload,
    applyFreeze,
    { customerId, disputeId: dispute.id, handler: 'charge.dispute.created' },
  );

  if (disputeError) {
    logger.error('Dispute freeze failed', disputeError);
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.warn('Tenant frozen after chargeback', { customerId, disputeId: dispute.id });
}

export async function handleDisputeClosed(
  { supabase, stripe }: StripeWebhookDeps,
  dispute: Stripe.Dispute,
): Promise<void> {
  // Le degel n'est PAS automatique quand le litige est perdu: l'argent est
  // parti, le tenant reste gele jusqu'a regularisation. Il ne l'est que si
  // le litige est gagne ('won'), c'est-a-dire si le paiement tient.
  if (dispute.status !== 'won') {
    logger.warn('Dispute closed against us, tenant stays frozen', {
      disputeId: dispute.id,
      status: dispute.status,
    });
    return;
  }

  const customerId = await disputeCustomerId(stripe, dispute);

  if (!customerId) return;

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
  const { data: tenant, error: disputeTenantError } = await selectTolerantToMissingFreezeReason(
    // CTR7-1: les verrous humains sont lus ici aussi - un litige gagne
    // ne rallume pas un tenant que la plateforme a coupe.
    'id, subscription_status, stripe_subscription_id, freeze_reason, suspended_at, deleted_at',
    (columns) =>
      supabase.from('tenants').select(columns).eq('stripe_customer_id', customerId).maybeSingle<{
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
    return;
  }

  // Le gel a pu etre leve entre-temps (paiement, nouvelle souscription):
  // rien a degeler, et surtout rien a reecrire par-dessus.
  if (tenant.subscription_status !== 'frozen') {
    logger.info('Dispute closed: tenant non gele, aucune ecriture', {
      tenantId: tenant.id,
      currentStatus: tenant.subscription_status,
    });
    return;
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
    return;
  }

  if (!tenant.stripe_subscription_id) {
    // Essai expire gele par le cron, ou tenant sans abonnement: aucun
    // abonnement ne paie cet acces, le litige gagne n'y change rien.
    logger.warn('Dispute gagne mais aucun abonnement Stripe: le tenant reste gele', {
      tenantId: tenant.id,
      disputeId: dispute.id,
    });
    return;
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
    return;
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
    return;
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
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.info('Litige gagne: statut realigne sur l abonnement Stripe', {
    tenantId: tenant.id,
    disputeId: dispute.id,
    restoredStatus,
  });
}
