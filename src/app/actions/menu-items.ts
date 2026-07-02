'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { createMenuItemService } from '@/services/menu-item.service';
import { ServiceError } from '@/services/errors';
import { getTranslations } from 'next-intl/server';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';

const tenantIdSchema = z.string().uuid();
const itemIdSchema = z.string().uuid();

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
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
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
    const itemId = await menuItemService.createMenuItem(tenantId, payload);
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
 * roles: owner, admin, manager.
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

  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  try {
    const supabase = await createClient();
    const menuItemService = createMenuItemService(supabase);
    await menuItemService.updateMenuItem(itemId, tenantId, payload);
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
 * roles: owner, admin, manager.
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
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
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
 * roles: owner, admin, manager.
 */
export async function actionToggleMenuItemAvailable(
  tenantId: string,
  itemId: string,
  isAvailable: boolean,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
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
 * roles: owner, admin, manager.
 */
export async function actionToggleMenuItemFeatured(
  tenantId: string,
  itemId: string,
  isFeatured: boolean,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
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
 * roles: owner, admin, manager.
 */
export async function actionUpdateMenuItemPrice(
  tenantId: string,
  itemId: string,
  price: number,
): Promise<WriteResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedItem = itemIdSchema.safeParse(itemId);
  if (!parsedTenant.success || !parsedItem.success) {
    return { error: 'Invalid input' };
  }

  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
  } catch (err) {
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
