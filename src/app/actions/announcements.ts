'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createAnnouncementService } from '@/services/announcement.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const announcementIdSchema = z.string().uuid();

const announcementPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
  is_active: z.boolean(),
});

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager']);
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    return { error: 'Permissions insuffisantes' };
  }
}

/**
 * SECURITY: Session membership verified before creating announcement.
 * createAnnouncement filters by tenant_id in the insert (belt-and-suspenders).
 */
export async function actionCreateAnnouncement(
  tenantId: string,
  payload: z.infer<typeof announcementPayloadSchema>,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedPayload = announcementPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const announcementService = createAnnouncementService(supabase);
    const data = await announcementService.createAnnouncement(tenantId, parsedPayload.data);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before updating announcement.
 * updateAnnouncement also filters by tenant_id (belt-and-suspenders).
 */
export async function actionUpdateAnnouncement(
  tenantId: string,
  announcementId: string,
  payload: z.infer<typeof announcementPayloadSchema>,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = announcementIdSchema.safeParse(announcementId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const parsedPayload = announcementPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const announcementService = createAnnouncementService(supabase);
    const data = await announcementService.updateAnnouncement(
      announcementId,
      tenantId,
      parsedPayload.data,
    );
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting announcement.
 * deleteAnnouncement also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeleteAnnouncement(
  tenantId: string,
  announcementId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = announcementIdSchema.safeParse(announcementId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const announcementService = createAnnouncementService(supabase);
    await announcementService.deleteAnnouncement(announcementId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before toggling announcement active state.
 * toggleActive also filters by tenant_id (belt-and-suspenders).
 */
export async function actionToggleAnnouncementActive(
  tenantId: string,
  announcementId: string,
  isActive: boolean,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = announcementIdSchema.safeParse(announcementId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const announcementService = createAnnouncementService(supabase);
    const data = await announcementService.toggleActive(announcementId, isActive, tenantId);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
