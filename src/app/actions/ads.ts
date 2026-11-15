'use server';

import { z } from 'zod';
import { renderableImageUrlSchema } from '@/lib/validations/image-url.schema';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { ALL_ADMIN_ROLES } from '@/lib/admin-roles';
import { createAdService } from '@/services/ad.service';
import { ServiceError } from '@/services/errors';
import { getStorageCleanup } from '@/services/storage-cleanup.service';
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
  // Rendered by next/image: only our storage host renders (image-url.schema.ts).
  image_url: renderableImageUrlSchema,
  link: z.string().nullable().optional(),
  sort_order: z.number().int().min(1),
  is_active: z.boolean(),
});

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, ALL_ADMIN_ROLES, 'menu.edit');
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
    return { error: null };
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) {
      return { error: err.message };
    }
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
    const cleanup = getStorageCleanup();
    const previousImages = await cleanup.imageUrlsOf('ads', adId, tenantId);
    await adService.deleteAd(adId, tenantId);
    await cleanup.release(tenantId, previousImages);
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
