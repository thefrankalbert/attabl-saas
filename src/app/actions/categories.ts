'use server';

import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import type { AdminRole, PreparationZone } from '@/types/admin.types';
import { createAuditService } from '@/services/audit.service';
import { createCategoryService } from '@/services/category.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';

const toggleCategoryActiveSchema = z.object({
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid(),
  isActive: z.boolean(),
});

const tenantIdSchema = z.string().uuid();
const categoryIdSchema = z.string().uuid();

type ActionResponse = {
  success?: boolean;
  error?: string;
};

/**
 * SECURITY: Authenticates user and verifies tenant membership + role.
 * tenantId is verified against the session (IDOR prevention).
 */
async function checkCategoryPermissions(
  tenantId: string,
  allowedRoles: AdminRole[] = ['owner', 'admin', 'manager'],
) {
  try {
    const { user, supabase, role } = await getAuthenticatedUserForTenant(tenantId, allowedRoles);
    return { error: null, supabase, user, role };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401)
        return { error: 'Non authentifie', supabase: null, user: null, role: undefined };
      return { error: 'Permissions insuffisantes', supabase: null, user: null, role: undefined };
    }
    return { error: 'Permissions insuffisantes', supabase: null, user: null, role: undefined };
  }
}

/**
 * Toggle category visibility (is_active).
 */
export async function actionToggleCategoryActive(
  tenantId: string,
  categoryId: string,
  isActive: boolean,
): Promise<ActionResponse> {
  const parsed = toggleCategoryActiveSchema.safeParse({ tenantId, categoryId, isActive });
  if (!parsed.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError, supabase, user, role } = await checkCategoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError || 'Erreur serveur' };

  const { error } = await supabase
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', categoryId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { error: error.message };
  }

  // Fire-and-forget audit log
  const audit = createAuditService(supabase, {
    tenantId,
    userId: user?.id,
    userEmail: user?.email ?? undefined,
    userRole: role,
  });
  audit.log({
    action: 'update',
    entityType: 'category',
    entityId: categoryId,
    newData: { is_active: isActive },
  });

  revalidateTag(CACHE_TAG_MENUS, 'max');

  return { success: true };
}

interface CreateCategoryPayload {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  is_active?: boolean;
  tenant_id: string;
  menu_id?: string | null;
}

/**
 * SECURITY: Verifies user belongs to tenant before creating a category.
 * Membership proven server-side; the service call uses the verified tenantId.
 */
export async function actionCreateCategory(
  tenantId: string,
  input: CreateCategoryPayload,
  options?: { returning?: boolean },
): Promise<{ success?: boolean; data?: unknown; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) {
    return { error: 'Invalid tenant ID' };
  }

  const { error: permError } = await checkCategoryPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const categoryService = createCategoryService(supabase);
    const data = await categoryService.createCategory({ ...input, tenant_id: tenantId }, options);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Server error' };
  }
}

interface UpdateCategoryPayload {
  name: string;
  name_en?: string | null;
  display_order?: number;
  preparation_zone?: PreparationZone;
  is_featured_on_home?: boolean;
  is_active?: boolean;
  tenant_id: string;
  menu_id?: string | null;
}

/**
 * SECURITY: Verifies user belongs to tenant before updating a category.
 * updateCategory also filters by tenant_id via the validated payload (belt-and-suspenders).
 */
export async function actionUpdateCategory(
  tenantId: string,
  categoryId: string,
  data: UpdateCategoryPayload,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCategory = categoryIdSchema.safeParse(categoryId);
  if (!parsedTenant.success || !parsedCategory.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkCategoryPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const categoryService = createCategoryService(supabase);
    await categoryService.updateCategory(categoryId, { ...data, tenant_id: tenantId });
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before deleting a category.
 * deleteCategory also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeleteCategory(
  tenantId: string,
  categoryId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCategory = categoryIdSchema.safeParse(categoryId);
  if (!parsedTenant.success || !parsedCategory.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkCategoryPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const categoryService = createCategoryService(supabase);
    await categoryService.deleteCategory(categoryId, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before reordering categories.
 * reorderCategories already filters by tenant_id in each update.
 */
export async function actionReorderCategories(
  tenantId: string,
  updates: { id: string; display_order: number }[],
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) {
    return { error: 'Invalid tenant ID' };
  }

  const { error: permError } = await checkCategoryPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const categoryService = createCategoryService(supabase);
    await categoryService.reorderCategories(tenantId, updates);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Verifies user belongs to tenant before assigning a category to a menu.
 * assignCategoryToMenu also filters by tenant_id (belt-and-suspenders).
 */
export async function actionAssignCategoryToMenu(
  tenantId: string,
  categoryId: string,
  menuId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCategory = categoryIdSchema.safeParse(categoryId);
  const parsedMenu = z.string().uuid().safeParse(menuId);
  if (!parsedTenant.success || !parsedCategory.success || !parsedMenu.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkCategoryPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const categoryService = createCategoryService(supabase);
    await categoryService.assignCategoryToMenu(categoryId, menuId, tenantId);
    revalidateTag(CACHE_TAG_MENUS, 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Server error' };
  }
}
