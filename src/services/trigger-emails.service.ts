import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmailService, isEmailDeliveryConfigured } from './email.service';
import { getTrialDaysRemaining } from '@/lib/plans/features';
import { logger } from '@/lib/logger';
import { buildUnsubscribeLinks } from '@/lib/email/unsubscribe-token';

type ActivationEvents = Record<string, string>;

/**
 * Destinataire d'une relance: la ligne `admin_users` (pour le lien de
 * desinscription signe) et son adresse. R5/T9: une personne desinscrite
 * (`lifecycle_emails_opt_out_at` pose) n'est JAMAIS un destinataire.
 */
export interface LifecycleRecipient {
  adminUserId: string;
  tenantId: string;
  email: string;
}

interface RecipientRow {
  id: string;
  email: string | null;
  lifecycle_emails_opt_out_at: string | null;
}

const RECIPIENT_COLUMNS = 'id, email, lifecycle_emails_opt_out_at';

/**
 * Le destinataire des relances d'un restaurant: son proprietaire. S'il n'y en a
 * pas, ou qu'il n'a pas d'adresse, `fallback` (la personne connectee, chemin du
 * tableau de bord) prend le relais avec sa PROPRE ligne du restaurant: sans
 * ligne, rien ne part, puisqu'aucune desinscription ne pourrait etre honoree.
 *
 * Un proprietaire desinscrit rend null, sans repli: sa desinscription vaut pour
 * le restaurant, la relance ne doit pas partir a quelqu'un d'autre a sa place.
 */
export async function findLifecycleRecipient(
  supabase: SupabaseClient,
  tenantId: string,
  fallback?: { userId: string; email: string },
): Promise<LifecycleRecipient | null> {
  const { data: owner } = await supabase
    .from('admin_users')
    .select(RECIPIENT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .maybeSingle<RecipientRow>();
  if (owner?.lifecycle_emails_opt_out_at) return null;
  if (owner?.email) return { adminUserId: owner.id, tenantId, email: owner.email };
  if (!fallback) return null;

  const { data: self } = await supabase
    .from('admin_users')
    .select(RECIPIENT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('user_id', fallback.userId)
    .maybeSingle<RecipientRow>();
  if (!self || self.lifecycle_emails_opt_out_at) return null;
  return { adminUserId: self.id, tenantId, email: self.email ?? fallback.email };
}

interface OrderTriggerParams {
  ordersCount: number;
  recipient: LifecycleRecipient;
  restaurantName: string;
  dashboardUrl: string;
  activationEvents: ActivationEvents;
}

interface TrialTriggerParams {
  recipient: LifecycleRecipient;
  restaurantName: string;
  dashboardUrl: string;
  trialEndsAt: string | null | undefined;
  activationEvents: ActivationEvents;
  ordersCount?: number;
}

/**
 * Pure computation: returns the event key that WOULD fire, without any side effects.
 * Use this + an atomic DB claim + sendOrderEmailForKey to avoid race conditions.
 */
export function determineOrderEventKey(
  params: Pick<OrderTriggerParams, 'ordersCount' | 'activationEvents'>,
): string | null {
  const { ordersCount, activationEvents } = params;
  if (ordersCount >= 1 && !activationEvents.first_order_email_sent) return 'first_order_email_sent';
  if (ordersCount >= 10 && !activationEvents.tenth_order_email_sent)
    return 'tenth_order_email_sent';
  return null;
}

/**
 * Fires the email for a given order event key. Call AFTER claiming the DB slot atomically.
 */
export async function sendOrderEmailForKey(
  key: string,
  params: Pick<OrderTriggerParams, 'recipient' | 'restaurantName' | 'dashboardUrl'>,
): Promise<void> {
  const svc = createEmailService();
  const { recipient, restaurantName, dashboardUrl } = params;
  const unsubscribe = buildUnsubscribeLinks(recipient);
  if (key === 'first_order_email_sent') {
    const result = await svc.sendFirstOrderTriggerEmail(recipient.email, {
      restaurantName,
      dashboardUrl,
      unsubscribe,
    });
    if (!result.success)
      logger.warn('First order trigger email failed to send', { restaurantName });
  } else if (key === 'tenth_order_email_sent') {
    const result = await svc.sendTenthOrderTriggerEmail(recipient.email, {
      restaurantName,
      dashboardUrl,
      unsubscribe,
    });
    if (!result.success)
      logger.warn('Tenth order trigger email failed to send', { restaurantName });
  }
}

/**
 * Pure computation: returns the event key that WOULD fire for trial triggers
 * evaluated during a visit (fin d'essai proche). Use this + an atomic DB claim
 * + sendTrialEmailForKey to avoid race conditions.
 *
 * B104: la relance d'inactivite n'est PLUS calculee ici. Calculee pendant une
 * visite, elle partait a une personne justement en train d'utiliser
 * l'application (un nouvel inscrit, `last_active_at` nul, la recevait des sa
 * premiere visite), et jamais a un vrai inactif, qui ne revient pas. Elle part
 * de la tache planifiee `trial-idle-emails` (sendTrialIdleEmails).
 */
export function determineTrialEventKey(
  params: Pick<TrialTriggerParams, 'trialEndsAt' | 'activationEvents'>,
): string | null {
  const { trialEndsAt, activationEvents } = params;
  const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
  if (daysLeft <= 3 && daysLeft > 0 && !activationEvents.endgame_email_sent)
    return 'endgame_email_sent';
  return null;
}

/** Silence au-dela duquel un essai est dit inactif. */
export const TRIAL_IDLE_AFTER_HOURS = 48;
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
  /** Proprietaire actif, joignable et abonne (jointure interne filtree cote serveur). */
  owners: { id: string; email: string | null; lifecycle_emails_opt_out_at: string | null }[] | null;
}

/**
 * Relance d'inactivite, envoyee par la tache planifiee `trial-idle-emails`
 * (client service_role: lecture de tous les restaurants en essai). Une seule
 * fois par restaurant: le creneau `idle_email_sent` est reserve atomiquement
 * (claim_activation_event) AVANT l'envoi.
 */
export async function sendTrialIdleEmails(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ candidates: number; sent: number }> {
  // Contre-audit 2: sans cle d'envoi, chaque reservation ci-dessous serait
  // brulee pour toujours sans qu'aucun courriel parte. Rien n'est reserve.
  if (!isEmailDeliveryConfigured()) {
    logger.error('Trial idle emails: envoi non configure (RESEND_API_KEY), aucune reservation');
    return { candidates: 0, sent: 0 };
  }
  const idleBefore = new Date(
    now.getTime() - TRIAL_IDLE_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();
  // Tout le tri se fait cote serveur (contre-audit 1): relance pas encore
  // partie, proprietaire actif avec une adresse (jointure interne), les plus
  // anciens silences d'abord, 50 au plus. Un restaurant deja relance ou sans
  // proprietaire joignable n'occupe plus une des places, et la lecture n'est
  // plus tronquee par le plafond de 1 000 lignes de l'API.
  const { data, error } = await supabase
    .from('tenants')
    .select(
      'id, name, slug, last_active_at, owners:admin_users!inner(id, email, lifecycle_emails_opt_out_at)',
    )
    .eq('subscription_status', 'trial')
    .eq('is_active', true)
    .is('deleted_at', null)
    .is('suspended_at', null)
    .not('last_active_at', 'is', null)
    .lt('last_active_at', idleBefore)
    .gt('trial_ends_at', now.toISOString())
    .is('activation_events->>idle_email_sent', null)
    .eq('owners.role', 'owner')
    .eq('owners.is_active', true)
    .is('owners.deleted_at', null)
    .not('owners.email', 'is', null)
    .is('owners.lifecycle_emails_opt_out_at', null)
    .order('last_active_at', { ascending: true })
    .limit(TRIAL_IDLE_MAX_PER_RUN);
  if (error) throw error;

  const candidates = ((data ?? []) as IdleTrialRow[]).filter((t) =>
    isTrialIdle(t.last_active_at, now),
  );
  const svc = createEmailService();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
  let sent = 0;
  for (const tenant of candidates) {
    // R5/T9: le filtre serveur exclut deja un proprietaire desinscrit; on le
    // reverifie ici pour qu'une requete modifiee ne puisse pas le relancer.
    const owner = tenant.owners?.find((o) => o.email && !o.lifecycle_emails_opt_out_at);
    if (!owner?.email) continue;

    const { data: claimed, error: claimError } = await supabase.rpc('claim_activation_event', {
      p_tenant_id: tenant.id,
      p_event_key: 'idle_email_sent',
    });
    if (claimError) {
      logger.error('Trial idle email: claim failed', claimError, { tenantId: tenant.id });
      continue;
    }
    if (!claimed) continue;

    // Un echec d'envoi apres la reservation n'est pas rejoue: voir le rapport
    // du lot B2b-3b (pas de liberation atomique de la reservation, et un envoi
    // peut avoir abouti chez le prestataire malgre l'erreur rendue).
    const result = await svc.sendTrialIdleEmail(owner.email, {
      restaurantName: tenant.name,
      dashboardUrl: `${appUrl}/sites/${tenant.slug}/admin`,
      unsubscribe: buildUnsubscribeLinks({ adminUserId: owner.id, tenantId: tenant.id }),
    });
    if (result.success) sent++;
    else logger.error('Trial idle trigger email failed to send', { tenantId: tenant.id });
  }
  return { candidates: candidates.length, sent };
}

/**
 * Fires the email for a given trial event key. Call AFTER claiming the DB slot atomically.
 */
export async function sendTrialEmailForKey(
  key: string,
  params: Pick<
    TrialTriggerParams,
    'recipient' | 'restaurantName' | 'dashboardUrl' | 'trialEndsAt' | 'ordersCount'
  >,
): Promise<void> {
  const svc = createEmailService();
  const { recipient, restaurantName, dashboardUrl, trialEndsAt, ordersCount = 0 } = params;
  if (key === 'endgame_email_sent') {
    const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
    const result = await svc.sendTrialEndgameEmail(recipient.email, {
      restaurantName,
      dashboardUrl,
      ordersCount,
      daysLeft,
      unsubscribe: buildUnsubscribeLinks(recipient),
    });
    if (!result.success)
      logger.warn('Trial endgame trigger email failed to send', { restaurantName, daysLeft });
  }
}
