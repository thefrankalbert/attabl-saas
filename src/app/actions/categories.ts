'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import type { AdminRole } from '@/types/admin.types';
import { createAuditService } from '@/services/audit.service';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

async function checkCategoryPermissions(
  tenantId: string,
  allowedRoles: AdminRole[] = ['owner', 'admin', 'manager'],
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Non authentifié', supabase, user: null };
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, user_id, tenant_id, role, is_active')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (!adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    return { error: 'Permissions insuffisantes', supabase, user, role: undefined };
  }

  return { error: null, supabase, user, role: adminUser.role as string };
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
