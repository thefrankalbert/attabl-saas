import { headers } from 'next/headers';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { hasPermission } from '@/lib/permissions';
import type { AdminRole, AdminUser } from '@/types/admin.types';
import type { PermissionCode, RolePermissions } from '@/types/permission.types';

/**
 * Authentication & authorization helpers.
 *
 * Usage in API routes:
 *   const { user, supabase } = await getAuthenticatedUser();
 *
 * Usage in protected server actions:
 *   const { user, tenantId, role, supabase } = await getAuthenticatedUserWithTenant();
 */

export interface AuthenticatedUser {
  user: { id: string; email: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface AuthenticatedUserWithTenant extends AuthenticatedUser {
  tenantId: string;
  role: string;
  /**
   * The actor's own `admin_users.id` (the membership-row PK) for this tenant.
   * Needed when writing FK columns that reference admin_users(id) - e.g.
   * `admin_users.created_by`, `invitations.invited_by`. This is NOT the auth
   * user id (`user.id` == `admin_users.user_id`).
   */
  adminUserId: string;
}

/**
 * Enforce a fine-grained permission code for a resolved membership, using the
 * same 3-level resolution as `hasPermission` (individual custom_permissions ->
 * tenant role_permissions override -> default matrix). Throws 403 on failure.
 *
 * Shared by getAuthenticatedUserWithTenant and getAuthenticatedUserForTenant so
 * per-user and per-role permission overrides bite at the mutation boundary.
 */
async function enforceTenantPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  role: string,
  customPermissions: AdminUser['custom_permissions'],
  requiredPermission: PermissionCode,
): Promise<void> {
  const principal = {
    role: role as AdminRole,
    custom_permissions: customPermissions,
  } as AdminUser;

  // Owner short-circuits inside hasPermission; skip the override lookup.
  let override: RolePermissions | null = null;
  if (principal.role !== 'owner') {
    const { data: roleOverride } = await supabase
      .from('role_permissions')
      .select('permissions')
      .eq('tenant_id', tenantId)
      .eq('role', principal.role)
      .maybeSingle();
    override = roleOverride
      ? ({ permissions: roleOverride.permissions } as unknown as RolePermissions)
      : null;
  }

  if (!hasPermission(principal, requiredPermission, override)) {
    throw new AuthError('Permissions insuffisantes', 403);
  }
}

/**
 * Get the currently authenticated user or throw.
 * Use in API routes and server actions that require authentication.
 *
 * @throws {AuthError} with status 401 if not authenticated
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError('Non authentifié', 401);
  }

  return {
    user: { id: user.id, email: user.email ?? '' },
    supabase,
  };
}

/**
 * Get the authenticated user AND their tenant.
 * Use in server actions and API routes that need tenant context.
 *
 * @throws {AuthError} with status 401 if not authenticated
 * @throws {AuthError} with status 403 if user has no tenant
 */
export async function getAuthenticatedUserWithTenant(
  requiredPermission?: PermissionCode,
): Promise<AuthenticatedUserWithTenant> {
  const { user, supabase } = await getAuthenticatedUser();

  // Prefer the tenant of the CURRENT request context. The middleware injects
  // `x-tenant-slug` for tenant-scoped admin paths; without this, a multi-tenant
  // owner (a user with admin_users rows in several tenants) would always operate
  // on their OLDEST membership instead of the tenant they are actually viewing
  // (e.g. editing the wrong restaurant's settings). When the header is present
  // and the user is an active member of that tenant, scope to it.
  const tenantSlug = readTenantSlug(await headers()).slug;
  if (tenantSlug) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();
    if (tenant?.id) {
      const { data: scoped } = await supabase
        .from('admin_users')
        .select('id, tenant_id, role, custom_permissions')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        // SESSION-FALLBACK: `deleted_at` etait filtre par le repli plus bas mais
        // PAS ici. Une appartenance soft-deleted scopait donc encore.
        .is('deleted_at', null)
        .maybeSingle();

      if (scoped) {
        if (requiredPermission) {
          await enforceTenantPermission(
            supabase,
            scoped.tenant_id,
            scoped.role,
            scoped.custom_permissions,
            requiredPermission,
          );
        }
        return {
          user,
          tenantId: scoped.tenant_id,
          role: scoped.role,
          adminUserId: scoped.id,
          supabase,
        };
      }

      // SESSION-FALLBACK, cas super_admin. Un operateur plateforme n'a en general
      // AUCUNE ligne admin_users sur les tenants clients: le layout admin lui
      // fabrique un owner virtuel sans creer de ligne. Sans cette resolution, il
      // tomberait dans le refus ci-dessous et la console plateforme casserait.
      // Une seule requete: elle etablit le statut ET fournit la ligne dont on a
      // besoin pour `adminUserId`. Seules les appartenances VIVANTES conferent
      // le god mode, un operateur revoque doit le perdre.
      const { data: superRow } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .or('is_super_admin.eq.true,role.eq.super_admin')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (superRow) {
        if (requiredPermission) {
          await enforceTenantPermission(supabase, tenant.id, 'owner', null, requiredPermission);
        }
        // Owner virtuel SUR LE TENANT DU HEADER, comme le layout: l'operateur
        // opere bien sur l'etablissement qu'il regarde.
        return {
          user,
          tenantId: tenant.id,
          role: 'owner',
          adminUserId: superRow.id,
          supabase,
        };
      }

      // SESSION-FALLBACK. Avant, on retombait ici sur l'appartenance la plus
      // ANCIENNE de l'utilisateur. Il n'y avait pas d'elevation cross-tenant,
      // mais un deputy confus: l'action partait en silence sur le mauvais
      // etablissement. Le scenario mesure dans l'audit: un super_admin ouvre
      // /sites/client-b/admin/settings, modifie le nom, le domaine custom ou les
      // taux de TVA, et la modification atterrit sur SON tenant a lui, sans
      // erreur ni alerte. Meme mecanique pour les moyens de paiement, les
      // designs QR, la creation d'etablissement et /api/admin/reset (destructif).
      //
      // Le slug designe un tenant qui existe et dont l'utilisateur n'est pas
      // membre actif: on refuse. Le repli reste reserve au cas ou aucun slug
      // n'accompagne la requete.
      logger.warn('Tenant scope refuse: utilisateur non membre du tenant demande', {
        userId: user.id,
        tenantSlug,
      });
      throw new AuthError('Acces non autorise pour ce tenant', 403);
    }
  }

  // Fallback (no tenant header, or user not a member of the header's tenant):
  // use limit(1).maybeSingle() instead of single() so this helper also works for
  // super_admin users who can have multiple admin_users rows. single() would
  // raise PGRST116 in that case and return a misleading 403.
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, role, custom_permissions')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !adminUser) {
    logger.warn('User has no tenant association', { userId: user.id });
    throw new AuthError('Accès non autorisé - aucun tenant associé', 403);
  }

  if (requiredPermission) {
    await enforceTenantPermission(
      supabase,
      adminUser.tenant_id,
      adminUser.role,
      adminUser.custom_permissions,
      requiredPermission,
    );
  }

  return {
    user,
    tenantId: adminUser.tenant_id,
    role: adminUser.role,
    adminUserId: adminUser.id,
    supabase,
  };
}

/**
 * Get the authenticated user and verify they belong to a specific tenant.
 * Use in server actions that receive tenantId from the client but need to
 * verify the user actually has access to that tenant (IDOR prevention).
 *
 * @param clientTenantId - The tenant ID provided by the client
 * @param allowedRoles - Roles that are allowed to perform the action (coarse gate).
 *   Typed `AdminRole[]`, not `string[]`: this parameter used to accept any string,
 *   so eleven order actions shipped the list `['owner','admin','manager','server']`
 *   with a role that does not exist ('server'; the enum says `waiter`) and the
 *   compiler said nothing. A non-existent role here matches nobody, and because
 *   this gate runs BEFORE `requiredPermission`, a too-narrow list silently
 *   overrides the fine permission - which is the real authorization rule.
 *   Prefer a named group from `@/lib/admin-roles` over a list written inline.
 * @param requiredPermission - Optional fine-grained permission code. When set, the
 *   action ALSO requires this permission via the 3-level resolution
 *   (individual custom_permissions -> tenant role_permissions override -> default
 *   matrix). This is what makes per-user and per-role permission overrides actually
 *   bite at the mutation boundary: without it, only the coarse role gate applied and
 *   a member's revoked permission was ignored on writes.
 * @throws {AuthError} with status 401 if not authenticated
 * @throws {AuthError} with status 403 if user does not belong to the tenant, has a
 *   disallowed role, or lacks the required permission
 */
export async function getAuthenticatedUserForTenant(
  clientTenantId: string,
  allowedRoles: AdminRole[] = ['owner', 'admin'],
  requiredPermission?: PermissionCode,
): Promise<AuthenticatedUserWithTenant> {
  const { user, supabase } = await getAuthenticatedUser();

  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, role, custom_permissions')
    .eq('user_id', user.id)
    .eq('tenant_id', clientTenantId)
    .eq('is_active', true)
    .single();

  if (error || !adminUser) {
    logger.warn('User attempted action on unauthorized tenant', {
      userId: user.id,
      attemptedTenantId: clientTenantId,
    });
    throw new AuthError('Acces non autorise pour ce tenant', 403);
  }

  if (!allowedRoles.includes(adminUser.role)) {
    throw new AuthError('Permissions insuffisantes', 403);
  }

  if (requiredPermission) {
    await enforceTenantPermission(
      supabase,
      adminUser.tenant_id,
      adminUser.role,
      adminUser.custom_permissions,
      requiredPermission,
    );
  }

  return {
    user,
    tenantId: adminUser.tenant_id,
    role: adminUser.role,
    adminUserId: adminUser.id,
    supabase,
  };
}

/**
 * Custom error class for authentication/authorization failures.
 * Includes HTTP status code for API responses.
 */
export class AuthError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
