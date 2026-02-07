import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Vérifie si un utilisateur est Super Admin
 * Le Super Admin a un accès universel à tous les tenants
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('admin_users')
    .select('is_super_admin, role')
    .eq('user_id', userId)
    .single();

  return data?.is_super_admin === true || data?.role === 'super_admin';
}

/**
 * Récupère les infos du Super Admin
 */
export async function getSuperAdminInfo(userId: string) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('admin_users')
    .select(`
      id,
      email,
      full_name,
      role,
      is_super_admin,
      tenant_id,
      tenants (
        id,
        slug,
        name
      )
    `)
    .eq('user_id', userId)
    .single();

  return data;
}

/**
 * Liste tous les tenants pour le Super Admin
 */
export async function getAllTenants() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('tenants')
    .select('id, slug, name, subscription_status, is_active')
    .order('name');

  return data || [];
}

/**
 * Permet au Super Admin d'accéder à un tenant spécifique
 * Retourne le slug du tenant
 */
export async function getSuperAdminAccessibleTenant(
  userId: string,
  requestedSlug?: string
): Promise<string | null> {
  const isAdmin = await isSuperAdmin(userId);

  if (!isAdmin) {
    return null;
  }

  const supabase = createAdminClient();

  // Si un slug est demandé, vérifier qu'il existe
  if (requestedSlug) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('slug', requestedSlug)
      .single();

    return tenant?.slug || null;
  }

  // Sinon retourner le premier tenant actif
  const { data: firstTenant } = await supabase
    .from('tenants')
    .select('slug')
    .eq('is_active', true)
    .limit(1)
    .single();

  return firstTenant?.slug || null;
}
