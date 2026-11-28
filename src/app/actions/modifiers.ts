'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { MENU_WITH_PRICE } from '@/lib/admin-roles';
import type { PermissionRequirement } from '@/lib/permissions';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { createModifierService } from '@/services/modifier.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const modifierIdSchema = z.string().uuid();

const createModifierPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  menu_item_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  name_en: z.string().max(100).nullable().optional(),
  price: z.number().min(0),
  is_available: z.boolean(),
  display_order: z.number().int().min(0),
});

async function checkPermissions(
  tenantId: string,
  requirement: PermissionRequirement = 'menu.edit',
): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, requirement);
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
 * SECURITY: Session membership verified before creating modifier.
 * NOTE: createModifier in the service does NOT filter/verify tenant_id in the write
 * query (inserts the data as-is, relying on RLS). Membership is proven server-side here;
 * tenant_id in payload is cross-checked against the session tenant.
 */
export async function actionCreateModifier(
  tenantId: string,
  payload: z.infer<typeof createModifierPayloadSchema>,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedPayload = createModifierPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  if (parsedPayload.data.tenant_id !== tenantId) return { error: 'Tenant mismatch' };

  // Un supplement payant fixe un prix: `menu.price` en plus, comme le
  // declencheur `garder_prix_carte` sur `item_modifiers`.
  const { error: permError } = await checkPermissions(
    tenantId,
    parsedPayload.data.price > 0 ? MENU_WITH_PRICE : 'menu.edit',
  );
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const modifierService = createModifierService(supabase);
    const data = await modifierService.createModifier(parsedPayload.data);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting modifier.
 * deleteModifier also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeleteModifier(
  tenantId: string,
  modifierId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = modifierIdSchema.safeParse(modifierId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    // Supprimer un supplement PAYANT puis le recreer gratuit faisait passer son
    // prix a 0 sans `menu.price` (audit de securite M1). Meme regle que le
    // declencheur `garder_prix_carte` : un supplement payant ne se supprime
    // qu'avec `menu.price`. Lecture en panne : refus.
    const { data: existing, error: readError } = await supabase
      .from('item_modifiers')
      .select('price, prices')
      .eq('id', modifierId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (readError) return { error: 'Server error' };
    if (existing && (Number(existing.price ?? 0) > 0 || existing.prices != null)) {
      const { error: priceError } = await checkPermissions(tenantId, MENU_WITH_PRICE);
      if (priceError) return { error: priceError };
    }
    const modifierService = createModifierService(supabase);
    await modifierService.deleteModifier(modifierId, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before toggling modifier availability.
 * toggleAvailable also filters by tenant_id (belt-and-suspenders).
 */
export async function actionToggleModifierAvailable(
  tenantId: string,
  modifierId: string,
  isAvailable: boolean,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = modifierIdSchema.safeParse(modifierId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const modifierService = createModifierService(supabase);
    await modifierService.toggleAvailable(modifierId, isAvailable, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
