'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { AdminRole, AdminUser } from '@/types/admin.types';
import { createAdminUserSchema } from '@/lib/validations/admin-user.schema';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { ServiceError } from '@/services/errors';

type ActionResponse = {
  success?: boolean;
  error?: string;
};

/**
 * Checks if the current user has permission to perform admin actions for a specific tenant.
 */
async function checkPermissions(tenantId: string, allowedRoles: AdminRole[] = ['owner', 'admin']) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Non authentifié', user: null };
  }

  // Check if user belongs to the tenant and has the required role
  const { data: adminUser, error: dbError } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  if (dbError || !adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    return { error: 'Permission refusée', user: null };
  }

  return { error: null, user };
}

/**
 * Creates a new admin user for a tenant.
 */
export async function createAdminUserAction(
  tenantId: string,
  formData: { email: string; password: string; full_name: string; role: string },
): Promise<ActionResponse> {
  const { error: permError, user: currentUser } = await checkPermissions(tenantId, [
    'owner',
    'admin',
  ]);
  if (permError) return { error: permError };

  // Validation Zod des données d'entrée
  const parsed = createAdminUserSchema.safeParse({
    email: formData.email,
    password: formData.password,
    full_name: formData.full_name,
    role: formData.role,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Données invalides' };
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
      return { error: 'Tenant introuvable' };
    }

    await planService.canAddAdmin(tenant);
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: 'Erreur lors de la vérification des limites du plan' };
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
    return { error: "Erreur lors de la création de l'utilisateur" };
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
    console.error('DB Insert Error:', dbError);
    return { error: 'Erreur lors de la liaison au tenant: ' + dbError.message };
  }

  revalidatePath(`/sites/${tenantId}/admin/users`);

  return { success: true };
}

/**
 * Deletes an admin user.
 * Vérifie si l'utilisateur appartient à d'autres tenants avant de supprimer le compte auth.
 */
export async function deleteAdminUserAction(
  tenantId: string,
  userId: string,
): Promise<ActionResponse> {
  const { error: permError } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const adminClient = createAdminClient();

  // Get the user to find auth_id
  const { data: targetUser } = await adminClient
    .from('admin_users')
    .select('user_id')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!targetUser) return { error: 'Utilisateur introuvable' };

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
      console.warn('Erreur lors de la suppression du compte auth:', authError);
      // Ne pas bloquer la suppression du lien si le compte auth ne peut pas être supprimé
    }
  }

  return { success: true };
}

/**
 * Updates a user's role or details.
 */
export async function updateAdminUserAction(
  tenantId: string,
  userId: string,
  data: Partial<AdminUser>,
): Promise<ActionResponse> {
  const { error: permError } = await checkPermissions(tenantId, ['owner', 'admin']);
  if (permError) return { error: permError };

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('admin_users')
    .update({
      role: data.role,
      full_name: data.full_name,
      is_active: data.is_active,
    })
    .eq('id', userId)
    .eq('tenant_id', tenantId); // Safety check

  if (error) return { error: error.message };

  return { success: true };
}
