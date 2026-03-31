'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { AdminRole, AdminUser } from '@/types/admin.types';
import { createAdminUserSchema, updateAdminUserSchema } from '@/lib/validations/admin-user.schema';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { createAuditService } from '@/services/audit.service';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';
import { getTranslations } from 'next-intl/server';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

/**
 * SECURITY: Authenticates user and verifies they belong to the tenant with the required role.
 * tenantId is verified against the session (IDOR prevention).
 */
async function checkPermissions(tenantId: string, allowedRoles: AdminRole[] = ['owner', 'admin']) {
  const t = await getTranslations('errors');
  try {
    const { user, role } = await getAuthenticatedUserForTenant(tenantId, allowedRoles);
    return { error: null, user, role };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated'), user: null, role: null };
      return { error: t('permissionDenied'), user: null, role: null };
    }
    return { error: t('permissionDenied'), user: null, role: null };
  }
}

/**
 * Creates a new admin user for a tenant.
 */
export async function actionCreateAdminUser(
  tenantId: string,
  formData: { email: string; password: string; full_name: string; role: string },
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  // Validation Zod des données d'entrée
  const parsed = createAdminUserSchema.safeParse({
    email: formData.email,
    password: formData.password,
    full_name: formData.full_name,
    role: formData.role,
  });
  const t = await getTranslations('errors');

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || t('invalidData') };
  }

  const adminClient = createAdminClient();

  // Vérification des limites du plan
  try {
    const planService = createPlanEnforcementService(adminClient);

    // Récupérer le tenant avec les infos de plan
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

    await planService.canAddAdmin(tenant);
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('planLimitError') };
  }

  // 1. Create Auth User
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authUser.user) {
    return { error: t('userCreationError') };
  }

  // 2. Insert into admin_users linked to tenant
  const { error: dbError } = await adminClient.from('admin_users').insert({
    id: crypto.randomUUID(),
    user_id: authUser.user.id,
    tenant_id: tenantId,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    is_active: true,
    created_by: currentUser!.id,
  });

  if (dbError) {
    // Rollback Auth User
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    logger.error('DB Insert Error:', { error: dbError.message });
    return { error: t('tenantLinkError') + dbError.message };
  }

  // Fire-and-forget audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser!.id,
    userEmail: currentUser!.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'create',
    entityType: 'user',
    entityId: authUser.user.id,
    newData: { email: parsed.data.email, full_name: parsed.data.full_name, role: parsed.data.role },
  });

  // Fetch tenant slug for correct revalidation path
  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single();
  if (tenantData?.slug) {
    revalidatePath(`/sites/${tenantData.slug}/admin/users`);
  }

  return { success: true };
}

/**
 * Deletes an admin user.
 * Vérifie si l'utilisateur appartient à d'autres tenants avant de supprimer le compte auth.
 */
export async function actionDeleteAdminUser(
  tenantId: string,
  userId: string,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const adminClient = createAdminClient();

  // Get the user to find auth_id
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email, full_name, role')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  const t = await getTranslations('errors');

  if (!targetUser) return { error: t('userNotFound') };

  // Vérifier si l'utilisateur appartient à d'autres tenants
  const { data: otherTenants } = await adminClient
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', targetUser.user_id)
    .neq('tenant_id', tenantId);

  // Supprimer le lien admin_users pour ce tenant
  const { error: dbError } = await adminClient
    .from('admin_users')
    .delete()
    .eq('id', userId)
    .eq('tenant_id', tenantId);

  if (dbError) return { error: dbError.message };

  // Supprimer le compte auth UNIQUEMENT si l'utilisateur n'appartient à aucun autre tenant
  if (!otherTenants || otherTenants.length === 0) {
    const { error: authError } = await adminClient.auth.admin.deleteUser(targetUser.user_id);
    if (authError) {
      logger.warn('Erreur lors de la suppression du compte auth:', { error: authError });
    }
  }

  // Fire-and-forget audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'delete',
    entityType: 'user',
    entityId: userId,
    oldData: { email: targetUser.email, full_name: targetUser.full_name, role: targetUser.role },
  });

  // Revalidate users page cache
  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single();
  if (tenantData?.slug) {
    revalidatePath(`/sites/${tenantData.slug}/admin/users`);
  }

  return { success: true };
}

/**
 * Updates a user's role or details.
 */
export async function actionUpdateAdminUser(
  tenantId: string,
  userId: string,
  data: Partial<AdminUser>,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role: currentRole,
  } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  // Validate input with Zod before DB write
  const parsed = updateAdminUserSchema.safeParse(data);
  const t = await getTranslations('errors');
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || t('invalidData') };
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('admin_users')
    .update({
      role: parsed.data.role,
      full_name: parsed.data.full_name,
      is_active: parsed.data.is_active,
    })
    .eq('id', userId)
    .eq('tenant_id', tenantId); // Safety check

  if (error) return { error: error.message };

  // Fire-and-forget audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: currentRole ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: 'user',
    entityId: userId,
    newData: { role: data.role, full_name: data.full_name, is_active: data.is_active },
  });

  // Revalidate users page cache
  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single();
  if (tenantData?.slug) {
    revalidatePath(`/sites/${tenantData.slug}/admin/users`);
  }

  return { success: true };
}

/**
 * Resets a collaborator's password (admin-only).
 */
export async function actionResetUserPassword(
  tenantId: string,
  userId: string,
  newPassword: string,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const t = await getTranslations('errors');

  if (!newPassword || newPassword.length < 8) {
    return { error: t('passwordTooShort') };
  }

  const adminClient = createAdminClient();

  // Get the auth user_id from admin_users
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!targetUser) return { error: t('userNotFound') };

  const { error: authError } = await adminClient.auth.admin.updateUserById(targetUser.user_id, {
    password: newPassword,
  });

  if (authError) return { error: authError.message };

  // Audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: 'user',
    entityId: userId,
    newData: { passwordReset: true },
  });

  return { success: true };
}

/**
 * Updates a collaborator's email (admin-only).
 */
export async function actionUpdateUserEmail(
  tenantId: string,
  userId: string,
  newEmail: string,
): Promise<ActionResponse> {
  const {
    error: permError,
    user: currentUser,
    role,
  } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const t = await getTranslations('errors');

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: t('invalidEmail') };
  }

  const adminClient = createAdminClient();

  // Get the auth user_id from admin_users
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id, email')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!targetUser) return { error: t('userNotFound') };

  // Update auth email
  const { error: authError } = await adminClient.auth.admin.updateUserById(targetUser.user_id, {
    email: newEmail,
    email_confirm: true,
  });

  if (authError) return { error: authError.message };

  // Update admin_users record
  const { error: dbError } = await adminClient
    .from('admin_users')
    .update({ email: newEmail })
    .eq('id', userId)
    .eq('tenant_id', tenantId);

  if (dbError) return { error: dbError.message };

  // Audit log
  const audit = createAuditService(adminClient, {
    tenantId,
    userId: currentUser?.id,
    userEmail: currentUser?.email ?? undefined,
    userRole: role ?? undefined,
  });
  audit.log({
    action: 'update',
    entityType: 'user',
    entityId: userId,
    oldData: { email: targetUser.email },
    newData: { email: newEmail },
  });

  return { success: true };
}
