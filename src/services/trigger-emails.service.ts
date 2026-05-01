import { createEmailService } from './email.service';
import { getTrialDaysRemaining } from '@/lib/plans/features';
import { logger } from '@/lib/logger';

export type ActivationEvents = Record<string, string>;

interface OrderTriggerParams {
  ordersCount: number;
  adminEmail: string;
  restaurantName: string;
  dashboardUrl: string;
  activationEvents: ActivationEvents;
}

interface TrialTriggerParams {
  adminEmail: string;
  restaurantName: string;
  dashboardUrl: string;
  trialEndsAt: string | null | undefined;
  lastActiveAt: string | null | undefined;
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
  params: Pick<OrderTriggerParams, 'adminEmail' | 'restaurantName' | 'dashboardUrl'>,
): Promise<void> {
  const svc = createEmailService();
  const { adminEmail, restaurantName, dashboardUrl } = params;
  if (key === 'first_order_email_sent') {
    const result = await svc.sendFirstOrderTriggerEmail(adminEmail, {
      restaurantName,
      dashboardUrl,
    });
    if (!result.success)
      logger.warn('First order trigger email failed to send', { restaurantName });
  } else if (key === 'tenth_order_email_sent') {
    const result = await svc.sendTenthOrderTriggerEmail(adminEmail, {
      restaurantName,
      dashboardUrl,
    });
    if (!result.success)
      logger.warn('Tenth order trigger email failed to send', { restaurantName });
  }
}

/**
 * Pure computation: returns the event key that WOULD fire for trial triggers.
 * Use this + an atomic DB claim + sendTrialEmailForKey to avoid race conditions.
 */
export function determineTrialEventKey(
  params: Pick<TrialTriggerParams, 'trialEndsAt' | 'lastActiveAt' | 'activationEvents'>,
): string | null {
  const { trialEndsAt, lastActiveAt, activationEvents } = params;
  const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
  if (daysLeft <= 3 && daysLeft > 0 && !activationEvents.endgame_email_sent)
    return 'endgame_email_sent';
  const lastActive = lastActiveAt ? new Date(lastActiveAt).getTime() : 0;
  const hoursSinceActive = (Date.now() - lastActive) / (1000 * 60 * 60);
  if (hoursSinceActive >= 48 && !activationEvents.idle_email_sent) return 'idle_email_sent';
  return null;
}

/**
 * Fires the email for a given trial event key. Call AFTER claiming the DB slot atomically.
 */
export async function sendTrialEmailForKey(
  key: string,
  params: Pick<
    TrialTriggerParams,
    'adminEmail' | 'restaurantName' | 'dashboardUrl' | 'trialEndsAt' | 'ordersCount'
  >,
): Promise<void> {
  const svc = createEmailService();
  const { adminEmail, restaurantName, dashboardUrl, trialEndsAt, ordersCount = 0 } = params;
  if (key === 'endgame_email_sent') {
    const daysLeft = getTrialDaysRemaining(trialEndsAt ?? null);
    const result = await svc.sendTrialEndgameEmail(adminEmail, {
      restaurantName,
      dashboardUrl,
      ordersCount,
      daysLeft,
    });
    if (!result.success)
      logger.warn('Trial endgame trigger email failed to send', { restaurantName, daysLeft });
  } else if (key === 'idle_email_sent') {
    const result = await svc.sendTrialIdleEmail(adminEmail, { restaurantName, dashboardUrl });
    if (!result.success) logger.warn('Trial idle trigger email failed to send', { restaurantName });
  }
}

/**
 * @deprecated Use determineOrderEventKey + (atomic DB claim) + sendOrderEmailForKey
 * to prevent race conditions on concurrent requests. Kept for compatibility.
 */
export async function checkAndFireOrderTrigger(params: OrderTriggerParams): Promise<string | null> {
  const { adminEmail, restaurantName, dashboardUrl, activationEvents, ordersCount } = params;
  const key = determineOrderEventKey({ ordersCount, activationEvents });
  if (!key) return null;
  await sendOrderEmailForKey(key, { adminEmail, restaurantName, dashboardUrl });
  return key;
}

/**
 * @deprecated Use determineTrialEventKey + (atomic DB claim) + sendTrialEmailForKey
 * to prevent race conditions on concurrent requests. Kept for compatibility.
 */
export async function checkAndFireTrialTrigger(params: TrialTriggerParams): Promise<string | null> {
  const {
    adminEmail,
    restaurantName,
    dashboardUrl,
    trialEndsAt,
    lastActiveAt,
    activationEvents,
    ordersCount = 0,
  } = params;
  const key = determineTrialEventKey({ trialEndsAt, lastActiveAt, activationEvents });
  if (!key) return null;
  await sendTrialEmailForKey(key, {
    adminEmail,
    restaurantName,
    dashboardUrl,
    trialEndsAt,
    ordersCount,
  });
  return key;
}
