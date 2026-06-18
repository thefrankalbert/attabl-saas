'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createAdService } from '@/services/ad.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const adIdSchema = z.string().uuid();

const createAdPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  image_url: z.string().url(),
  link: z.string().nullable().optional(),
  sort_order: z.number().int().min(1),
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
 * SECURITY: Session membership verified before creating ad.
 * NOTE: createAd in the service does NOT filter by tenant_id in the query (relies on RLS).
 * Membership is proven server-side here. Service receives tenant_id via payload but has
 * no DB-level tenant filter on the write path.
 */
export async function actionCreateAd(
  tenantId: string,
  payload: z.infer<typeof createAdPayloadSchema>,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedPayload = createAdPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  if (parsedPayload.data.tenant_id !== tenantId) return { error: 'Tenant mismatch' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const adService = createAdService(supabase);
    const data = await adService.createAd(parsedPayload.data);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting ad.
 * deleteAd also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeleteAd(tenantId: string, adId: string): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedAdId = adIdSchema.safeParse(adId);
  if (!parsedTenant.success || !parsedAdId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const adService = createAdService(supabase);
    await adService.deleteAd(adId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before toggling ad active state.
 * toggleActive also filters by tenant_id (belt-and-suspenders).
 */
export async function actionToggleAdActive(
  tenantId: string,
  adId: string,
  isActive: boolean,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedAdId = adIdSchema.safeParse(adId);
  if (!parsedTenant.success || !parsedAdId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const adService = createAdService(supabase);
    const data = await adService.toggleActive(adId, isActive, tenantId);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
