'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const notificationIdSchema = z.string().uuid();
const notificationIdsSchema = z.array(z.string().uuid()).min(1).max(200);

/**
 * Marks a single notification as read.
 * SECURITY: Session membership verified before the write. The update is
 * scoped by tenant_id AND the notification id (belt-and-suspenders + RLS).
 */
export async function actionMarkNotificationRead(
  tenantId: string,
  notificationId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = notificationIdSchema.safeParse(notificationId);
  if (!parsedTenant.success || !parsedId.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(parsedTenant.data, [
      'owner',
      'admin',
      'manager',
    ]);

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('tenant_id', parsedTenant.data)
      .eq('id', parsedId.data);

    if (error) {
      logger.error('actionMarkNotificationRead: update failed', { error, tenantId });
      return { error: 'Erreur interne' };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    logger.error('actionMarkNotificationRead: unexpected error', { err, tenantId });
    return { error: 'Erreur interne' };
  }
}

/**
 * Marks several notifications as read.
 * SECURITY: Session membership verified before the write. The update is
 * scoped by tenant_id AND the notification ids (belt-and-suspenders + RLS).
 */
export async function actionMarkAllNotificationsRead(
  tenantId: string,
  notificationIds: string[],
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedIds = notificationIdsSchema.safeParse(notificationIds);
  if (!parsedTenant.success || !parsedIds.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(parsedTenant.data, [
      'owner',
      'admin',
      'manager',
    ]);

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('tenant_id', parsedTenant.data)
      .in('id', parsedIds.data);

    if (error) {
      logger.error('actionMarkAllNotificationsRead: update failed', { error, tenantId });
      return { error: 'Erreur interne' };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    logger.error('actionMarkAllNotificationsRead: unexpected error', { err, tenantId });
    return { error: 'Erreur interne' };
  }
}
