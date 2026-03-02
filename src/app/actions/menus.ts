'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import type { AdminRole } from '@/types/admin.types';
import { createMenuSchema, updateMenuSchema } from '@/lib/validations/menu.schema';
import { createMenuService } from '@/services/menu.service';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { createAuditService } from '@/services/audit.service';
import { ServiceError } from '@/services/errors';

type ActionResponse = {
  success?: boolean;
  error?: string;
  data?: unknown;
};

/**
 * Check admin permissions for a tenant.
 */
async function checkMenuPermissions(
  tenantId: string,
  allowedRoles: AdminRole[] = ['owner', 'admin', 'manager'],
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Non authentifié', supabase, user: null, role: undefined };
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, user_id, tenant_id, role, is_active, custom_permissions')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (!adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    return { error: 'Permissions insuffisantes', supabase, user, role: undefined };
  }

  return { error: null, supabase, user, adminUser, role: adminUser.role as string };
}

/**
 * Create a new menu (carte).
 */
export async function actionCreateMenu(
  tenantId: string,
  formData: {
    name: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    venue_id?: string | null;
    parent_menu_id?: string | null;
    image_url?: string;
    is_active?: boolean;
    display_order?: number;
  },
): Promise<ActionResponse> {
  const { error: permError, supabase, user, role } = await checkMenuPermissions(tenantId);
  if (permError || !supabase) return { error: permError || 'Erreur serveur' };

  // Validate input
  const parsed = createMenuSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Données invalides' };
  }

  try {
    // Check plan limits
    const { data: tenant } = await supabase
      .from('tenants')
      .select(
        'id, name, slug, is_active, created_at, subscription_plan, subscription_status, trial_ends_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenant) {
      const enforcement = createPlanEnforcementService(supabase);
      await enforcement.canAddMenu(tenant);
    }

    const menuService = createMenuService(supabase);
    const menu = await menuService.createMenu(tenantId, parsed.data);

    // Fire-and-forget audit log
    const audit = createAuditService(supabase, {
      tenantId,
      userId: user?.id,
      userEmail: user?.email ?? undefined,
      userRole: role,
    });
    audit.log({
      action: 'create',
      entityType: 'menu',
      entityId: (menu as { id: string }).id,
      newData: parsed.data,
    });

    revalidateTag('menus', 'max');
    return { success: true, data: menu };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors de la création de la carte' };
  }
}

/**
 * Update an existing menu.
 */
export async function actionUpdateMenu(
  tenantId: string,
  formData: {
    id: string;
    name?: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    venue_id?: string | null;
    parent_menu_id?: string | null;
    image_url?: string;
    is_active?: boolean;
    display_order?: number;
  },
): Promise<ActionResponse> {
  const { error: permError, supabase, user, role } = await checkMenuPermissions(tenantId);
  if (permError || !supabase) return { error: permError || 'Erreur serveur' };

  const parsed = updateMenuSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Données invalides' };
  }

  try {
    const menuService = createMenuService(supabase);
    const menu = await menuService.updateMenu(parsed.data);

    // Fire-and-forget audit log
    const audit = createAuditService(supabase, {
      tenantId,
      userId: user?.id,
      userEmail: user?.email ?? undefined,
      userRole: role,
    });
    audit.log({
      action: 'update',
      entityType: 'menu',
      entityId: parsed.data.id,
      newData: parsed.data,
    });

    revalidateTag('menus', 'max');
    return { success: true, data: menu };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors de la mise à jour de la carte' };
  }
}

/**
 * Delete a menu.
 */
export async function actionDeleteMenu(tenantId: string, menuId: string): Promise<ActionResponse> {
  const {
    error: permError,
    supabase,
    user,
    role,
  } = await checkMenuPermissions(tenantId, ['owner', 'admin']);
  if (permError || !supabase) return { error: permError || 'Erreur serveur' };

  try {
    const menuService = createMenuService(supabase);
    await menuService.deleteMenu(menuId);

    // Fire-and-forget audit log
    const audit = createAuditService(supabase, {
      tenantId,
      userId: user?.id,
      userEmail: user?.email ?? undefined,
      userRole: role,
    });
    audit.log({ action: 'delete', entityType: 'menu', entityId: menuId });

    revalidateTag('menus', 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors de la suppression de la carte' };
  }
}

/**
 * Reorder menus.
 */
export async function actionReorderMenus(
  tenantId: string,
  orderedIds: string[],
): Promise<ActionResponse> {
  const { error: permError, supabase } = await checkMenuPermissions(tenantId);
  if (permError || !supabase) return { error: permError || 'Erreur serveur' };

  try {
    const menuService = createMenuService(supabase);
    await menuService.reorderMenus(tenantId, orderedIds);

    revalidateTag('menus', 'max');
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors du réordonnancement' };
  }
}
