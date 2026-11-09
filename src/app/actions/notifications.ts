'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';
import { ALL_ADMIN_ROLES } from '@/lib/admin-roles';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const notificationIdSchema = z.string().uuid();
const notificationIdsSchema = z.array(z.string().uuid()).min(1).max(200);

/**
 * Records "I have read these" for the CALLER only.
 *
 * Restaurant-wide notifications (user_id NULL: new order, stock alert) used to
 * share ONE `read` flag. Since every member can clear their bell (X17), a
 * waiter's "mark all as read" hid the new order from the owner and managers.
 * Read state is now per person (notification_reads, migration
 * 20261109210000): the row carries the caller's user id, and RLS only accepts
 * a notification of this restaurant that is visible to the caller.
 * SECURITY: session membership verified before the write; tenant_id from the
 * validated argument is re-checked by getAuthenticatedUserForTenant and RLS.
 */
async function markReadForMe(
  action: string,
  tenantId: string,
  notificationIds: string[],
): Promise<ActionResponse> {
  try {
    // Tout membre recoit la cloche: tout membre peut la vider, pour lui seul.
    const { supabase, user } = await getAuthenticatedUserForTenant(tenantId, ALL_ADMIN_ROLES);

    const { error } = await supabase.from('notification_reads').upsert(
      notificationIds.map((id) => ({
        notification_id: id,
        user_id: user.id,
        tenant_id: tenantId,
      })),
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true },
    );

    if (error) {
      logger.error(`${action}: insert failed`, { error, tenantId });
      return { error: 'Erreur interne' };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    logger.error(`${action}: unexpected error`, { err, tenantId });
    return { error: 'Erreur interne' };
  }
}

/** Marks a single notification as read, for the caller only. */
export async function actionMarkNotificationRead(
  tenantId: string,
  notificationId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = notificationIdSchema.safeParse(notificationId);
  if (!parsedTenant.success || !parsedId.success) {
    return { error: 'Donnees invalides' };
  }
  return markReadForMe('actionMarkNotificationRead', parsedTenant.data, [parsedId.data]);
}

/** Marks several notifications as read, for the caller only. */
export async function actionMarkAllNotificationsRead(
  tenantId: string,
  notificationIds: string[],
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedIds = notificationIdsSchema.safeParse(notificationIds);
  if (!parsedTenant.success || !parsedIds.success) {
    return { error: 'Donnees invalides' };
  }
  return markReadForMe('actionMarkAllNotificationsRead', parsedTenant.data, parsedIds.data);
}
