import type { SupabaseClient } from '@supabase/supabase-js';

import { hasPermission } from '@/lib/permissions';
import type { AdminRole, AdminUser } from '@/types/admin.types';
import type { PermissionCode, RolePermissions } from '@/types/permission.types';

/**
 * Resolution UNIQUE de "cet utilisateur a-t-il cette permission dans ce tenant".
 *
 * POURQUOI CE FICHIER EXISTE. La meme regle etait ecrite trois fois - dans le
 * garde du middleware, dans le garde de page qui redirige, et dans sa jumelle
 * qui renvoie un booleen. Les trois copies avaient DERIVE, et pas sur des
 * details:
 *
 *   - deux d'entre elles ne filtraient ni `is_active` ni `deleted_at`, donc un
 *     membre suspendu ou supprime en douceur gardait son ancien role a leurs
 *     yeux;
 *   - une seule court-circuitait sur `is_super_admin` de la ligne de membre, si
 *     bien qu'un super-admin ayant aussi une ligne de membre a role faible
 *     etait autorise par le middleware et refuse par la page;
 *   - l'une utilisait `.single()` la ou l'autre utilisait `.maybeSingle()`, ce
 *     qui ne se comporte pas pareil quand un utilisateur a plusieurs lignes -
 *     exactement le cas d'un super-admin.
 *
 * Aucune de ces derives n'etait exploitable: le middleware couvre les 23 pages
 * gardees et le layout admin filtre les memberships morts pour toutes les
 * autres (verifie route par route). Mais une regle d'autorisation ecrite trois
 * fois finit par etre vraie deux fois sur trois, et la copie fautive est alors
 * la seule couche le jour ou une route echappe aux deux autres.
 *
 * La resolution reproduite ici est celle du garde du middleware, la plus
 * stricte des trois:
 *   1. membre VIVANT du tenant (`is_active`, pas de `deleted_at`) -> son role
 *      et ses `custom_permissions`;
 *   2. sinon super-admin plateforme VIVANT -> acces de niveau owner partout;
 *   3. sinon refuse.
 *
 * Puis le modele a 3 niveaux de `hasPermission`: surcharge individuelle ->
 * surcharge de role du tenant -> matrice par defaut.
 *
 * ECHEC FERME: toute erreur de resolution refuse l'acces.
 */
export interface AdminPermissionResolution {
  allowed: boolean;
  /**
   * Le role retenu pour la decision: celui du membre, ou `owner` pour un
   * super-admin non membre. `null` quand l'utilisateur n'est ni l'un ni l'autre.
   */
  role: AdminRole | null;
}

export async function resolveAdminPermission(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  permission: PermissionCode,
): Promise<AdminPermissionResolution> {
  // Seuls les memberships VIVANTS comptent: un membre banni (is_active=false)
  // ou supprime en douceur (deleted_at) doit etre refuse.
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('role, custom_permissions, is_super_admin')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (!adminData) {
    // Pas membre direct: on n'autorise que les super-admins plateforme VIVANTS.
    const { data: superAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .eq('is_super_admin', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    return superAdmin
      ? { allowed: true, role: 'owner' as AdminRole }
      : { allowed: false, role: null };
  }

  const role = adminData.role as AdminRole;

  if (adminData.is_super_admin) {
    return { allowed: true, role };
  }

  const { data: roleOverride } = await supabase
    .from('role_permissions')
    .select('permissions')
    .eq('tenant_id', tenantId)
    .eq('role', role)
    .maybeSingle();

  // hasPermission ne lit que `.permissions`; le select omet les autres champs
  // de RolePermissions, d'ou le cast.
  const override = roleOverride
    ? ({ permissions: roleOverride.permissions } as unknown as RolePermissions)
    : null;

  // hasPermission ne lit que `role` et `custom_permissions`.
  const principal = {
    role,
    custom_permissions: adminData.custom_permissions,
  } as unknown as AdminUser;

  return { allowed: hasPermission(principal, permission, override), role };
}
