import { getTranslations } from 'next-intl/server';
import { AdminRole } from '@/types/admin.types';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';

/**
 * Garde d'autorisation des Server Actions d'equipe (reserve S8' du contre-audit
 * LOT 4: ce helper vivait dans `src/app/actions/admin.ts`, sous `'use server'`).
 *
 * Il n'est PAS exporte comme Server Action - ce module n'a pas de `'use server'`
 * - exactement comme `@/lib/auth/target-account-scope` et
 * `@/lib/auth/role-hierarchy`, deja extraits du meme fichier. La contrainte
 * Turbopack ne porte que sur les actions EXPORTEES d'un fichier `'use server'`.
 *
 * SECURITE: authentifie l'appelant et verifie qu'il appartient au tenant avec
 * un role autorise. `tenantId` est verifie contre la session (prevention IDOR),
 * et la permission fine `team.manage` est appliquee par
 * `getAuthenticatedUserForTenant`. Le message rendu est generique (jamais le
 * detail de l'erreur), comme les autres refus de ces actions.
 */
export interface TenantAdminCheck {
  error: string | null;
  user: { id: string; email: string } | null;
  role: string | null;
  adminUserId: string | null;
}

export async function checkTenantAdminPermissions(
  tenantId: string,
  allowedRoles: AdminRole[] = ['owner', 'admin'],
): Promise<TenantAdminCheck> {
  const t = await getTranslations('errors');
  try {
    const { user, role, adminUserId } = await getAuthenticatedUserForTenant(
      tenantId,
      allowedRoles,
      'team.manage',
    );
    return { error: null, user, role, adminUserId };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401)
        return { error: t('notAuthenticated'), user: null, role: null, adminUserId: null };
      return { error: t('permissionDenied'), user: null, role: null, adminUserId: null };
    }
    return { error: t('permissionDenied'), user: null, role: null, adminUserId: null };
  }
}
