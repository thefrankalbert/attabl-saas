import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  FREEZE_REASONS,
  selectTolerantToMissingFreezeReason,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { expireOtherOpenCheckouts } from '@/lib/billing/expire-open-checkouts';
import { ServiceError } from '../errors';
import type { SubscriptionStatus } from '@/types/billing';
import type { StripeWebhookDeps } from './deps';
import { arbitrerDoubleAbonnement } from './double-abonnement';
import { unsettledDisputeBlocksUnfreeze } from './disputes';
import {
  freezeReasonPreservingCause,
  isActiveUnlessLocked,
  isEntitlingWithoutPayment,
  isHealthySubscriptionStatus,
  isValidInterval,
  isValidPlan,
  mapStripeStatus,
} from './status';

/**
 * `checkout.session.completed` - le PREMIER paiement. C'est le seul evenement
 * dont la perte coute un client qui a paye et n'a rien recu, d'ou son
 * fail-closed REJOUABLE (ServiceError INTERNAL, qui fait retirer la ligne
 * d'idempotence par la route) la ou les autres gestionnaires se contentent de
 * ne rien ecrire.
 */
export async function handleCheckoutSessionCompleted(
  { supabase, stripe }: StripeWebhookDeps,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const tenantId = session.metadata?.tenant_id;
  const plan = session.metadata?.plan;
  const billingInterval = session.metadata?.billing_interval;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!tenantId) return;

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
  // Les trois autres gestionnaires se contentent de ne rien ecrire parce
  // qu'ils n'ont rien a perdre: aucun premier paiement ne depend d'eux.
  // Celui-ci, oui (CTR7-3). Comme pour l'abonnement illisible: on
  // n'ecrit rien, la route retire la ligne d'idempotence et renvoie 500,
  // pour que Stripe rejoue a partir d'une ligne intacte.
  if (existingTenantError) {
    // R10-2: distinguer l'illisible du INTROUVABLE. `.single()` sur zero
    // ligne rend PGRST116, et c'est une condition PERMANENTE: le tenant
    // a ete supprime, ou l'identifiant porte par la session est faux.
    // Rejouer n'y changera rien, donc un 500 ferait rejouer Stripe
    // pendant trois jours pour un evenement qui ne reussira jamais - et
    // un endpoint qui echoue sans cesse finit DESACTIVE par Stripe,
    // ce qui ferait perdre les evenements de TOUS les autres clients.
    // C'est le meme raisonnement que la sortie du gestionnaire de
    // litige. Un echec transitoire, lui, reste rejouable.
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
      return;
    }

    logger.error(
      'checkout.session.completed: ligne tenant illisible, aucun acces accorde',
      existingTenantError,
      { tenantId },
    );
    throw new ServiceError('Tenant row unreadable', 'INTERNAL');
  }

  if (existingTenant?.stripe_subscription_id === subscriptionId) {
    logger.info('checkout.session.completed already processed, skipping', {
      tenantId,
      subscriptionId,
    });
    return;
  }

  const abonnementCourant = existingTenant?.stripe_subscription_id;
  const arbitrage = await arbitrerDoubleAbonnement(stripe, {
    tenantId,
    abonnementCourant,
    subscriptionId,
    customerId,
    session,
  });
  if (!arbitrage.poursuivre) return;
  const signalerRemplacementInacheve = arbitrage.signalerInacheve;

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
      logger.error('Abonnement illisible chez Stripe: aucun acces accorde (fail-closed)', err, {
        tenantId,
        subscriptionId,
      });
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
  // Un echec de LECTURE est transitoire: on n'ecrit rien du tout, la
  // route retire la ligne d'idempotence et renvoie 500 pour que Stripe
  // rejoue (trois jours). Aucun acces n'est accorde en aveugle, et le
  // rejeu repart d'une ligne intacte. Le risque "endpoint desactive par
  // Stripe" suppose un taux d'echec DURABLE de son propre API, pas un
  // 429 isole - et il est preferable a la perte definitive du premier
  // paiement. La session SANS abonnement, elle, est une condition
  // PERMANENTE: la rejouer pendant trois jours ne servirait a rien,
  // donc elle reste en 200.
  if (subscriptionUnreadable) {
    signalerRemplacementInacheve('lecture du nouvel abonnement');
    throw new ServiceError('Subscription unreadable', 'INTERNAL');
  }

  // Mettre a jour le tenant avec les infos Stripe
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
    logger.warn('checkout.session.completed: billing_interval invalide dans metadata, ignore', {
      tenantId,
      billingInterval,
    });
  }

  // L'ecriture ne passe que si l'abonnement enregistre est toujours celui qui
  // a ete lu plus haut. Deux paiements traites en meme temps lisaient tous
  // deux "aucun abonnement" et le dernier ecrasait l'autre, qui continuait
  // d'etre preleve sans etre vu. Le perdant n'ecrit rien et rejoue: au rejeu,
  // le filet ci-dessus arbitre entre les deux abonnements.
  const ecriture = await updateTolerantToMissingFreezeReason(
    updateData,
    (payload) => {
      const requete = supabase
        .from('tenants')
        .update(payload, { count: 'exact' })
        .eq('id', tenantId);
      return abonnementCourant
        ? requete.eq('stripe_subscription_id', abonnementCourant)
        : requete.is('stripe_subscription_id', null);
    },
    { tenantId, handler: 'checkout.session.completed' },
  );
  const updateError = ecriture.error;

  // Seul un ZERO explicite vaut "aucune ligne": PostgREST rend un nombre
  // avec `count: 'exact'`. Une valeur absente n'est pas prise pour un echec.
  if (!updateError && (ecriture as { count?: number | null }).count === 0) {
    logger.warn('checkout.session.completed: abonnement enregistre entre-temps, rejeu', {
      tenantId,
      subscriptionId,
    });
    signalerRemplacementInacheve('ecriture: abonnement enregistre entre-temps');
    throw new ServiceError('Concurrent subscription write', 'INTERNAL');
  }

  if (updateError) {
    logger.error('DB update failed for checkout.session.completed', updateError, {
      tenantId,
      subscriptionId,
    });
    signalerRemplacementInacheve('ecriture en base');
    // La route retire la ligne d'idempotence pour que le rejeu de Stripe
    // retraite cet evenement au lieu d'etre court-circuite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.info('Tenant activated via checkout', {
    tenantId,
    plan,
    billingInterval,
    subscriptionStatus: mappedStatus,
  });

  // M-01: ce restaurant vient de payer. Les autres sessions qu'il avait
  // laissees ouvertes ne doivent plus pouvoir l'etre.
  await expireOtherOpenCheckouts(stripe, {
    tenantId,
    customerId,
    email: session.customer_details?.email ?? session.customer_email,
    exceptSessionId: session.id,
  });
}
