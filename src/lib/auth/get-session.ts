import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

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
export async function getAuthenticatedUserWithTenant(): Promise<AuthenticatedUserWithTenant> {
  const { user, supabase } = await getAuthenticatedUser();

  // Prefer the tenant of the CURRENT request context. The middleware injects
  // `x-tenant-slug` for tenant-scoped admin paths; without this, a multi-tenant
  // owner (a user with admin_users rows in several tenants) would always operate
  // on their OLDEST membership instead of the tenant they are actually viewing
  // (e.g. editing the wrong restaurant's settings). When the header is present
  // and the user is an active member of that tenant, scope to it.
  const tenantSlug = (await headers()).get('x-tenant-slug');
  if (tenantSlug) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();
    if (tenant?.id) {
      const { data: scoped } = await supabase
        .from('admin_users')
        .select('id, tenant_id, role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (scoped) {
        return {
          user,
          tenantId: scoped.tenant_id,
          role: scoped.role,
          adminUserId: scoped.id,
          supabase,
        };
      }
      // Header present but the user is not a member of that tenant: fall through
      // to the oldest-membership lookup below (never elevate cross-tenant).
    }
  }

  // Fallback (no tenant header, or user not a member of the header's tenant):
  // use limit(1).maybeSingle() instead of single() so this helper also works for
  // super_admin users who can have multiple admin_users rows. single() would
  // raise PGRST116 in that case and return a misleading 403.
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, role')
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
 * @param allowedRoles - Roles that are allowed to perform the action
 * @throws {AuthError} with status 401 if not authenticated
 * @throws {AuthError} with status 403 if user does not belong to the tenant or has wrong role
 */
export async function getAuthenticatedUserForTenant(
  clientTenantId: string,
  allowedRoles: string[] = ['owner', 'admin'],
): Promise<AuthenticatedUserWithTenant> {
  const { user, supabase } = await getAuthenticatedUser();

  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, role')
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
