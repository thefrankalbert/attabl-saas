import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmailService, isEmailDeliveryConfigured } from './email.service';
import { createEmailUnsubscribeService } from './email-unsubscribe.service';
import { getTrialDaysRemaining } from '@/lib/plans/features';
import { logger } from '@/lib/logger';
import {
  buildUnsubscribeLinks,
  isUnsubscribeConfigured,
  normalizeEmailAddress,
  type UnsubscribeLinks,
} from '@/lib/email-unsubscribe-token';

type ActivationEvents = Record<string, string>;

interface OrderTriggerParams {
  ordersCount: number;
  activationEvents: ActivationEvents;
}

interface TrialTriggerParams {
  trialEndsAt: string | null | undefined;
  activationEvents: ActivationEvents;
}

/**
 * Pure computation: returns the event key that WOULD fire, without any side effects.
 * The send itself (claim included) is claimAndSendOrderEmail.
 */
export function determineOrderEventKey(params: OrderTriggerParams): string | null {
  const { ordersCount, activationEvents } = params;
  if (ordersCount >= 1 && !activationEvents.first_order_email_sent) return 'first_order_email_sent';
  if (ordersCount >= 10 && !activationEvents.tenth_order_email_sent)
    return 'tenth_order_email_sent';
  return null;
}

/**
 * Lot desabonnement: une relance commerciale ne part que si l'envoi est
 * configure, que le secret des liens de desabonnement est en place, et que
 * l'adresse n'est pas desabonnee. Tout est verifie AVANT la reservation du
 * creneau (`claim_activation_event`): une relance qui ne peut pas partir ne
 * consomme rien, et une adresse desabonnee garde sa relance si elle se
 * reabonne. Rend les liens a mettre dans l'e-mail, ou `null` (ne rien envoyer).
 * Une lecture des desabonnements en echec donne `null`: mieux vaut une
 * relance manquee qu'une relance a une personne qui a dit non.
 */
async function prepareMarketingEmail(
  supabase: SupabaseClient,
  email: string,
  context: { tenantId: string; eventKey: string },
): Promise<UnsubscribeLinks | null> {
  if (!isEmailDeliveryConfigured()) {
    logger.error(
      'Relance commerciale: envoi non configure (RESEND_API_KEY), rien reserve',
      undefined,
      context,
    );
    return null;
  }
  const links = buildUnsubscribeLinks(email);
  if (!links) {
    logger.error(
      'Relance commerciale: EMAIL_UNSUBSCRIBE_SECRET absent ou adresse invalide, rien reserve',
      undefined,
      context,
    );
    return null;
  }
  try {
    const unsubscribed = await createEmailUnsubscribeService(supabase).isUnsubscribed(
      normalizeEmailAddress(email),
    );
    return unsubscribed ? null : links;
  } catch (err) {
    logger.error('Relance commerciale: lecture des desabonnements impossible', err, context);
    return null;
  }
}

/** Reserve le creneau de l'evenement; `false` si deja pris ou en erreur. */
async function claimEvent(
  supabase: SupabaseClient,
  tenantId: string,
  eventKey: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_activation_event', {
    p_tenant_id: tenantId,
    p_event_key: eventKey,
  });
  if (error) {
    logger.error('Relance commerciale: reservation impossible', error, { tenantId, eventKey });
    return false;
  }
  return data === true;
}

interface MarketingTarget {
  tenantId: string;
  adminEmail: string;
  restaurantName: string;
  dashboardUrl: string;
}

/**
 * Premiere ou dixieme commande: verifie l'adresse, reserve le creneau
 * atomiquement (fusion dans la ligne VIVANTE, jamais d'instantane perime),
 * puis envoie.
 */
export async function claimAndSendOrderEmail(
  supabase: SupabaseClient,
  key: string,
  target: MarketingTarget,
): Promise<void> {
  if (key !== 'first_order_email_sent' && key !== 'tenth_order_email_sent') return;
  const { tenantId, adminEmail, restaurantName, dashboardUrl } = target;
  const unsubscribe = await prepareMarketingEmail(supabase, adminEmail, {
    tenantId,
    eventKey: key,
  });
  if (!unsubscribe || !(await claimEvent(supabase, tenantId, key))) return;

  const svc = createEmailService();
  const data = { restaurantName, dashboardUrl, unsubscribe };
  const result =
    key === 'first_order_email_sent'
      ? await svc.sendFirstOrderTriggerEmail(adminEmail, data)
      : await svc.sendTenthOrderTriggerEmail(adminEmail, data);
  if (!result.success) logger.warn('Order trigger email failed to send', { tenantId, key });
}

/**
 * Pure computation: returns the event key that WOULD fire for trial triggers
 * evaluated during a visit (fin d'essai proche). The send itself (claim
 * included) is claimAndSendTrialEmail.
 *
 * B104: la relance d'inactivite n'est PLUS calculee ici. Calculee pendant une
 * visite, elle partait a une personne justement en train d'utiliser
 * l'application (un nouvel inscrit, `last_active_at` nul, la recevait des sa
 * premiere visite), et jamais a un vrai inactif, qui ne revient pas. Elle part
 * de la tache planifiee `trial-idle-emails` (sendTrialIdleEmails).
 */
export function determineTrialEventKey(params: TrialTriggerParams): string | null {
  const { trialEndsAt, activationEvents } = params;
  const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
  if (daysLeft <= 3 && daysLeft > 0 && !activationEvents.endgame_email_sent)
    return 'endgame_email_sent';
  return null;
}

/** Silence au-dela duquel un essai est dit inactif. */
const TRIAL_IDLE_AFTER_HOURS = 48;
/** Plafond de relances par passage (meilleur effort, la suite au passage suivant). */
const TRIAL_IDLE_MAX_PER_RUN = 50;

/**
 * B104: inactif = une derniere visite CONNUE, plus vieille que 48 h. Une date
 * absente (jamais vue) ou illisible n'est pas une inactivite: elle n'est
 * jamais devinee.
 */
export function isTrialIdle(lastActiveAt: string | null | undefined, now: Date): boolean {
  if (!lastActiveAt) return false;
  const last = Date.parse(lastActiveAt);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last >= TRIAL_IDLE_AFTER_HOURS * 60 * 60 * 1000;
}

interface IdleTrialRow {
  id: string;
  name: string;
  slug: string;
  last_active_at: string | null;
  /** Proprietaire actif et joignable (jointure interne filtree cote serveur). */
  owners: { email: string | null }[] | null;
}

/**
 * Tours de lecture au plus par passage. Chaque tour reprend APRES le dernier
 * restaurant lu (curseur sur la cle de tri): une page entiere de proprietaires
 * desabonnes ne bloque donc plus les suivants (sans cela, 50 desabonnes en
 * tete de file confisquaient toutes les places, passage apres passage, puisque
 * leur creneau n'est jamais pris).
 */
const TRIAL_IDLE_MAX_ROUNDS = 10;

/**
 * Filtre `or` de PostgREST qui reprend la lecture apres `(last_active_at, id)`.
 * Taille FIXE quel que soit le tour (contre-audit 1, D2: une liste d'exclusion
 * des restaurants deja vus faisait grossir l'URL de 2 Ko par tour, 18 Ko au
 * dixieme, au-dela de ce qu'accepte une passerelle HTTP courante). Les valeurs
 * viennent de la base (horodatage, uuid) et sont entre guillemets doubles.
 * Premier tour: aucune reprise (condition deja imposee par la requete).
 */
export function idleCursorFilter(after: { lastActiveAt: string; id: string } | null): string {
  if (!after) return 'last_active_at.not.is.null';
  const at = `"${after.lastActiveAt}"`;
  return `last_active_at.gt.${at},and(last_active_at.eq.${at},id.gt.${after.id})`;
}

/**
 * Relance d'inactivite, envoyee par la tache planifiee `trial-idle-emails`
 * (client service_role: lecture de tous les restaurants en essai). Une seule
 * fois par restaurant: le creneau `idle_email_sent` est reserve atomiquement
 * (claim_activation_event) AVANT l'envoi, et APRES la verification du
 * desabonnement (une adresse desabonnee ne consomme pas sa relance).
 */
export async function sendTrialIdleEmails(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ candidates: number; sent: number; unsubscribed: number }> {
  // Contre-audit 2: sans cle d'envoi, chaque reservation ci-dessous serait
  // brulee pour toujours sans qu'aucun courriel parte. Rien n'est reserve.
  if (!isEmailDeliveryConfigured()) {
    logger.error('Trial idle emails: envoi non configure (RESEND_API_KEY), aucune reservation');
    return { candidates: 0, sent: 0, unsubscribed: 0 };
  }
  // Lot desabonnement: sans secret, aucun lien de desabonnement possible,
  // donc aucune relance (jamais d'e-mail commercial sans lien valide).
  if (!isUnsubscribeConfigured()) {
    logger.error('Trial idle emails: EMAIL_UNSUBSCRIBE_SECRET absent, aucune reservation');
    return { candidates: 0, sent: 0, unsubscribed: 0 };
  }
  const idleBefore = new Date(
    now.getTime() - TRIAL_IDLE_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const svc = createEmailService();
  const unsubscribes = createEmailUnsubscribeService(supabase);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
  let cursor: { lastActiveAt: string; id: string } | null = null;
  let candidates = 0;
  let attempts = 0;
  let sent = 0;
  let unsubscribed = 0;

  for (let round = 0; round < TRIAL_IDLE_MAX_ROUNDS && attempts < TRIAL_IDLE_MAX_PER_RUN; round++) {
    // Tout le tri se fait cote serveur (contre-audit 1): relance pas encore
    // partie, proprietaire actif avec une adresse (jointure interne), les plus
    // anciens silences d'abord, 50 au plus. Un restaurant deja relance ou sans
    // proprietaire joignable n'occupe plus une des places, et la lecture n'est
    // plus tronquee par le plafond de 1 000 lignes de l'API.
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, slug, last_active_at, owners:admin_users!inner(email)')
      .eq('subscription_status', 'trial')
      .eq('is_active', true)
      .is('deleted_at', null)
      .is('suspended_at', null)
      .not('last_active_at', 'is', null)
      .lt('last_active_at', idleBefore)
      .gt('trial_ends_at', now.toISOString())
      .is('activation_events->>idle_email_sent', null)
      .contains('owners.postes', ['owner'])
      .eq('owners.is_active', true)
      .is('owners.deleted_at', null)
      .not('owners.email', 'is', null)
      // Reprise apres le dernier restaurant du tour precedent. L'ordre est
      // TOTAL (`id` departage deux dates egales): aucun restaurant n'est lu
      // deux fois ni saute.
      .or(idleCursorFilter(cursor))
      .order('last_active_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(TRIAL_IDLE_MAX_PER_RUN);
    if (error) throw error;
    const rows = (data ?? []) as IdleTrialRow[];
    if (rows.length === 0) break;
    const last = rows[rows.length - 1];
    // `last_active_at` n'est jamais nul ici (filtre de la requete).
    cursor = { lastActiveAt: last.last_active_at ?? '', id: last.id };

    const page = rows
      .filter((t) => isTrialIdle(t.last_active_at, now))
      .map((t) => ({ tenant: t, email: t.owners?.find((o) => o.email)?.email ?? null }))
      .filter((c): c is { tenant: IdleTrialRow; email: string } => c.email !== null);
    candidates += page.length;
    // Une seule lecture par page. Une erreur LEVE (la tache repond 500): on
    // n'envoie jamais sans savoir si l'adresse a dit non.
    const blocked = await unsubscribes.findUnsubscribed(
      page.map((c) => normalizeEmailAddress(c.email)),
    );

    for (const { tenant, email } of page) {
      if (attempts >= TRIAL_IDLE_MAX_PER_RUN) break;
      if (blocked.has(normalizeEmailAddress(email))) {
        unsubscribed++;
        continue;
      }
      const unsubscribe = buildUnsubscribeLinks(email);
      if (!unsubscribe) {
        logger.error('Trial idle email: lien de desabonnement impossible', undefined, {
          tenantId: tenant.id,
        });
        continue;
      }
      if (!(await claimEvent(supabase, tenant.id, 'idle_email_sent'))) continue;
      attempts++;

      // Un echec d'envoi apres la reservation n'est pas rejoue: voir le rapport
      // du lot B2b-3b (pas de liberation atomique de la reservation, et un envoi
      // peut avoir abouti chez le prestataire malgre l'erreur rendue).
      const result = await svc.sendTrialIdleEmail(email, {
        restaurantName: tenant.name,
        dashboardUrl: `${appUrl}/sites/${tenant.slug}/admin`,
        unsubscribe,
      });
      if (result.success) sent++;
      else
        logger.error('Trial idle trigger email failed to send', undefined, { tenantId: tenant.id });
    }
    if (rows.length < TRIAL_IDLE_MAX_PER_RUN) break;
  }
  return { candidates, sent, unsubscribed };
}

/**
 * Fin d'essai proche: verifie l'adresse, reserve le creneau, puis envoie.
 */
export async function claimAndSendTrialEmail(
  supabase: SupabaseClient,
  key: string,
  target: MarketingTarget & { trialEndsAt: string | null | undefined; ordersCount?: number },
): Promise<void> {
  if (key !== 'endgame_email_sent') return;
  const { tenantId, adminEmail, restaurantName, dashboardUrl, trialEndsAt } = target;
  const unsubscribe = await prepareMarketingEmail(supabase, adminEmail, {
    tenantId,
    eventKey: key,
  });
  if (!unsubscribe || !(await claimEvent(supabase, tenantId, key))) return;

  const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
  const result = await createEmailService().sendTrialEndgameEmail(adminEmail, {
    restaurantName,
    dashboardUrl,
    ordersCount: target.ordersCount ?? 0,
    daysLeft,
    unsubscribe,
  });
  if (!result.success) logger.warn('Trial endgame trigger email failed to send', { tenantId });
}
