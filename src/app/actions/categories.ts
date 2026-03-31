'use server';

import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import type { AdminRole } from '@/types/admin.types';
import { createAuditService } from '@/services/audit.service';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';

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
