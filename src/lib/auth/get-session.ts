import { headers } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import {
  currentAssuranceLevel,
  isMfaSatisfied,
  MFA_REQUIRED_MESSAGE,
} from '@/lib/auth/mfa-assurance';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { resolveMemberLevels } from '@/lib/auth/member-rights';
import {
  isOwner,
  meetsRequirement,
  toPermissionMap,
  toPostes,
  type PermissionLevels,
  type PermissionRequirement,
} from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

/**
 * Authentication & authorization helpers.
 *
 * Usage in API routes:
 *   const { user, supabase } = await getAuthenticatedUser();
 *
 * Usage in protected server actions:
 *   const { user, tenantId, postes, supabase } = await getAuthenticatedUserWithTenant();
 */

export interface AuthenticatedUser {
  user: { id: string; email: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface AuthenticatedUserWithTenant extends AuthenticatedUser {
  tenantId: string;
  /** Postes cumules du membre (`['owner']` pour un super administrateur virtuel). */
  postes: Poste[];
  isOwner: boolean;
  /** Niveau effectif des 22 droits, resolu comme la base le fait. */
  levels: PermissionLevels;
  /**
   * The actor's own `admin_users.id` (the membership-row PK) for this tenant.
   * Needed when writing FK columns that reference admin_users(id) - e.g.
   * `admin_users.created_by`, `invitations.invited_by`. This is NOT the auth
   * user id (`user.id` == `admin_users.user_id`).
   */
  adminUserId: string;
}

/**
 * Exigence explicite "etre membre vivant du restaurant, sans droit particulier".
 * A passer a `getAuthenticatedUserForTenant` par les rares gestes ouverts a
 * toute l'equipe (vider SA cloche de notifications). Nommee expres : une garde
 * sans exigence ne doit jamais etre un oubli.
 */
export const MEMBER_ONLY = 'member-only' as const;

/** Ce qu'une garde par restaurant exige : un droit, ou l'appartenance nommee. */
export type TenantGuardRequirement = PermissionRequirement | typeof MEMBER_ONLY;

interface MembershipRow {
  id: string;
  tenant_id: string;
  postes: unknown;
  permission_overrides: unknown;
}

/**
 * Resout les droits d'une ligne de membre et applique l'exigence de la garde.
 * Meme resolution que la base (`tenant_permission_level`) : proprietaire,
 * reglage par personne, puis cumul des postes avec les reglages du restaurant.
 * Leve 403 si l'exigence n'est pas remplie.
 *
 * Partage par getAuthenticatedUserWithTenant et getAuthenticatedUserForTenant :
 * un droit retire par le proprietaire mord donc a la frontiere de l'ecriture.
 */
async function resolveMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AuthenticatedUser['user'],
  row: MembershipRow,
  requirement: TenantGuardRequirement | undefined,
  virtualOwnerOf?: string,
): Promise<AuthenticatedUserWithTenant> {
  const tenantId = virtualOwnerOf ?? row.tenant_id;
  const postes: Poste[] = virtualOwnerOf ? ['owner'] : toPostes(row.postes);
  const member = {
    postes,
    permission_overrides: virtualOwnerOf ? null : toPermissionMap(row.permission_overrides),
  };
  const levels = await resolveMemberLevels(supabase, tenantId, member);

  if (requirement && requirement !== MEMBER_ONLY && !meetsRequirement(levels, requirement)) {
    throw new AuthError('Permissions insuffisantes', 403);
  }

  return {
    user,
    tenantId,
    postes,
    isOwner: isOwner(member),
    levels,
    adminUserId: row.id,
    supabase,
  };
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

  await assertMfaSatisfied(supabase, user);

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
  requiredPermission?: PermissionRequirement,
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
    // Audit B23: tout ce bloc se terminait par un refus SAUF quand la ligne
    // `tenants` etait cachee par la RLS (restaurant inactif ou suspendu): on
    // retombait alors sur le repli, et l'ecriture partait sur l'appartenance la
    // plus ancienne, un autre restaurant. Avec un slug, on ne sort d'ici que
    // par un retour scope au tenant du slug ou par un refus.
    if (tenant?.id) {
      const { data: scoped } = await supabase
        .from('admin_users')
        .select('id, tenant_id, postes, permission_overrides')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        // SESSION-FALLBACK: `deleted_at` etait filtre par le repli plus bas mais
        // PAS ici. Une appartenance soft-deleted scopait donc encore.
        .is('deleted_at', null)
        .maybeSingle();

      if (scoped) {
        return resolveMembership(supabase, user, scoped, requiredPermission);
      }
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
      .select('id, tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .or('is_super_admin.eq.true,role.eq.super_admin')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Les politiques SELECT de `tenants` cachent un restaurant inactif meme au
    // super_admin (audit B23): son id est alors resolu par la lecture du
    // layout admin (`getTenant`, service_role, voit les inactifs). Import
    // paresseux: ce chemin est rare et `@/lib/cache` tire `next/cache`.
    const superTenantId = superRow
      ? (tenant?.id ?? (await (await import('@/lib/cache')).getTenant(tenantSlug))?.id)
      : undefined;
    if (superRow && superTenantId) {
      // Mode dieu = session renforcee (facteur verifie ET aal2), comme
      // `requireSuperAdmin` et comme la base (`is_super_admin()` exige aal2,
      // migration 20261127210000). Sans ce controle, un super administrateur
      // SANS facteur, avec son seul mot de passe, operait sur n'importe quel
      // restaurant par les routes API et les Server Actions (audit d'equipe du
      // 2026-11-27, contre-audit du lot 1): `assertMfaSatisfied` laisse passer
      // un compte sans facteur, et `/api/admin/reset` appelle ensuite la base
      // en service_role, que la RLS ne voit pas.
      // Le jeton aal2 n'est delivre qu'apres un code TOTP verifie: il suffit a
      // prouver le facteur (`user` ici ne porte plus `factors`).
      const strong = (await currentAssuranceLevel(supabase)) === 'aal2';
      if (!strong) {
        throw new AuthError(MFA_REQUIRED_MESSAGE, 403);
      }
      // Proprietaire virtuel SUR LE TENANT DU HEADER, comme le layout: l'operateur
      // opere bien sur l'etablissement qu'il regarde.
      return resolveMembership(
        supabase,
        user,
        { ...superRow, postes: null, permission_overrides: null },
        requiredPermission,
        superTenantId,
      );
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

  // Fallback (no tenant header, or user not a member of the header's tenant):
  // use limit(1).maybeSingle() instead of single() so this helper also works for
  // super_admin users who can have multiple admin_users rows. single() would
  // raise PGRST116 in that case and return a misleading 403.
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, postes, permission_overrides')
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

  return resolveMembership(supabase, user, adminUser, requiredPermission);
}

/**
 * Get the authenticated user and verify they belong to a specific tenant.
 * Use in server actions that receive tenantId from the client but need to
 * verify the user actually has access to that tenant (IDOR prevention).
 *
 * @param clientTenantId - The tenant ID provided by the client
 * @param requiredPermission - Exigence OBLIGATOIRE (voir `PermissionRequirement`) :
 *   un code, plusieurs codes (TOUS exiges), `anyOf` ou `atLeastLimited`. Le
 *   droit decide SEUL : il n'y a plus de liste de roles a cote. Une liste de
 *   roles posee avant le droit annulait en silence les reglages du proprietaire
 *   (un gerant a qui l'on donnait `team.manage` restait refuse).
 *   Pas de valeur par defaut : avant le lot des postes, l'absence d'exigence
 *   voulait dire "proprietaire ou administrateur" ; la rendre facultative
 *   l'aurait ouverte a tout membre. Un geste ouvert a toute l'equipe le dit en
 *   passant `MEMBER_ONLY`.
 * @throws {AuthError} with status 401 if not authenticated
 * @throws {AuthError} with status 403 if user does not belong to the tenant or
 *   lacks the required permission
 */
export async function getAuthenticatedUserForTenant(
  clientTenantId: string,
  requiredPermission: TenantGuardRequirement,
): Promise<AuthenticatedUserWithTenant> {
  const { user, supabase } = await getAuthenticatedUser();

  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, tenant_id, postes, permission_overrides')
    .eq('user_id', user.id)
    .eq('tenant_id', clientTenantId)
    .eq('is_active', true)
    // Un membre retire (`deleted_at`) ne doit plus agir, meme si sa ligne est
    // restee active. L'index unique garantit une seule ligne vivante.
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !adminUser) {
    logger.warn('User attempted action on unauthorized tenant', {
      userId: user.id,
      attemptedTenantId: clientTenantId,
    });
    throw new AuthError('Acces non autorise pour ce tenant', 403);
  }

  return resolveMembership(supabase, user, adminUser, requiredPermission);
}

/**
 * Double authentification des operations authentifiees: leve 403 si le compte
 * a un facteur verifie et que la session n'est pas aal2 (voir `isMfaSatisfied`).
 * Appelee par `getAuthenticatedUser`, donc par les deux fonctions qui en
 * derivent; les appels directs a `auth.getUser()` l'appellent eux-memes.
 */
async function assertMfaSatisfied(
  supabase: Pick<SupabaseClient, 'auth'>,
  user: Pick<User, 'factors'>,
): Promise<void> {
  if (!(await isMfaSatisfied(supabase, user))) {
    throw new AuthError(MFA_REQUIRED_MESSAGE, 403);
  }
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
