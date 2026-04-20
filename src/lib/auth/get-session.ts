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

  // Use limit(1).maybeSingle() instead of single() so this helper also works
  // for super_admin users who can have multiple admin_users rows. single()
  // would raise PGRST116 in that case and return a misleading 403.
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
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
    .select('tenant_id, role')
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
