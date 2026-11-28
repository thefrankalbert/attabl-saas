'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { createMenuItemService } from '@/services/menu-item.service';
import { getStorageCleanup } from '@/services/storage-cleanup.service';
import { ServiceError } from '@/services/errors';
import { getTranslations } from 'next-intl/server';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { MENU_WITH_PRICE } from '@/lib/admin-roles';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { menuItemCreateSchema, menuItemUpdateSchema } from '@/lib/validations/menu-item.schema';
import '@/lib/validations/zod-fr-error-map';

const tenantIdSchema = z.string().uuid();
const itemIdSchema = z.string().uuid();
// Audit B42: ces trois actions sont des POST appelables directement; le prix
// (FCFA, entier, borne de la colonne numeric(10,2)) et les drapeaux etaient
// ecrits sans validation.
const itemPriceSchema = z.number().int().min(0).max(99_999_999);
const itemFlagSchema = z.boolean();

type CreateMenuItemResponse = {
  itemId?: string;
  error?: string;
};

/**
 * Atomically checks plan limits and creates a menu item in one server round-trip.
 * Eliminates the race condition between a separate plan-check call + client-side INSERT.
 * SECURITY: tenantId derived from session, never from client payload.
 */
export async function actionCreateMenuItem(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<CreateMenuItemResponse> {
  const parsed = tenantIdSchema.safeParse(tenantId);
  if (!parsed.success) {
    return { error: 'Invalid tenant ID' };
  }

  const t = await getTranslations('errors');

  try {
    // Creer un plat, c'est fixer son prix: les deux droits, comme la politique
    // INSERT de `menu_items` en base.
    await getAuthenticatedUserForTenant(tenantId, MENU_WITH_PRICE);
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  const parsedPayload = menuItemCreateSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { error: parsedPayload.error.issues[0]?.message ?? t('validationError') };
  }

  const adminClient = createAdminClient();

  try {
    const planService = createPlanEnforcementService(adminClient);

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return { error: t('tenantNotFound') };
    }

    await planService.canAddMenuItem(tenant);
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('planLimitError') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    const itemId = await menuItemService.createMenuItem(tenantId, parsedPayload.data);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { itemId };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}

type WriteResponse = {
  success?: boolean;
  error?: string;
};

/**
 * SECURITY: Verifies user belongs to tenant before updating a menu item.
 */
export async function actionUpdateMenuItem(
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  let canEditPrice = false;
  try {
    const { levels } = await getAuthenticatedUserForTenant(tenantId, 'menu.edit');
    canEditPrice = levels['menu.price'] === 'full';
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  const parsedPayload = menuItemUpdateSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { error: parsedPayload.error.issues[0]?.message ?? t('validationError') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    // PRIX. Le formulaire d'un plat renvoie toujours `price` et `prices`, meme
    // inchanges. Sans le droit `menu.price`, on ne refuse donc que si le prix
    // CHANGE (meme regle que le declencheur `garder_prix_carte`), et les champs
    // de prix sont retires de l'ecriture. Refus AVANT toute ecriture.
    const data = parsedPayload.data;
    if (!canEditPrice && ('price' in data || 'prices' in data)) {
      const current = await menuItemService.getPrices(itemId, tenantId);
      const samePrice = !('price' in data) || Number(data.price) === Number(current.price);
      const samePrices =
        !('prices' in data) ||
        JSON.stringify(data.prices ?? null) === JSON.stringify(current.prices ?? null);
      if (!samePrice || !samePrices) return { error: t('permissionDenied') };
      delete data.price;
      delete data.prices;
    }
    // Remplacement d'image: on retient les anciennes avant l'ecriture, on les
    // libere apres (R-05). Un plat supprime en douceur garde sa photo.
    const touchesImages = 'image_url' in data || 'images' in data;
    const cleanup = getStorageCleanup();
    const previousImages = touchesImages
      ? await cleanup.imageUrlsOf('menu_items', itemId, tenantId)
      : [];
    await menuItemService.updateMenuItem(itemId, tenantId, data);
    if (touchesImages) await cleanup.release(tenantId, previousImages);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before deleting a menu item.
 */
export async function actionDeleteMenuItem(
  tenantId: string,
  itemId: string,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, 'menu.edit');
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    await menuItemService.deleteMenuItem(itemId, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before toggling item availability.
 */
export async function actionToggleMenuItemAvailable(
  tenantId: string,
  itemId: string,
  isAvailable: boolean,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (
    !parsedTenant.success ||
    !parsedItem.success ||
    !itemFlagSchema.safeParse(isAvailable).success
  ) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, 'menu.edit');
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    await menuItemService.toggleAvailable(itemId, isAvailable, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before toggling item featured flag.
 */
export async function actionToggleMenuItemFeatured(
  tenantId: string,
  itemId: string,
  isFeatured: boolean,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (
    !parsedTenant.success ||
    !parsedItem.success ||
    !itemFlagSchema.safeParse(isFeatured).success
  ) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, 'menu.edit');
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    await menuItemService.toggleFeatured(itemId, isFeatured, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before updating item price.
 */
export async function actionUpdateMenuItemPrice(
  tenantId: string,
  itemId: string,
  price: number,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success || !itemPriceSchema.safeParse(price).success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, 'menu.price');
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message };
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    await menuItemService.updatePrice(itemId, price, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('serverError') };
  }
}
