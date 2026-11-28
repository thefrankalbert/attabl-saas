import { getTranslations } from 'next-intl/server';
import {
  getAuthenticatedUserForTenant,
  AuthError,
  type AuthenticatedUserWithTenant,
} from '@/lib/auth/get-session';

/**
 * Garde d'autorisation des Server Actions d'equipe (reserve S8' du contre-audit
 * LOT 4: ce helper vivait dans `src/app/actions/admin.ts`, sous `'use server'`).
 *
 * Il n'est PAS exporte comme Server Action - ce module n'a pas de `'use server'`
 * - exactement comme `@/lib/auth/target-account-scope` et
 * `@/lib/auth/poste-authority`, deja extraits du meme fichier. La contrainte
 * Turbopack ne porte que sur les actions EXPORTEES d'un fichier `'use server'`.
 *
 * SECURITE: authentifie l'appelant et verifie qu'il appartient au tenant.
 * `tenantId` est verifie contre la session (prevention IDOR), et le droit
 * `team.manage` decide SEUL (plus de liste de roles a cote): un gerant le
 * detient par defaut, et le proprietaire peut le lui retirer. Le message rendu est generique (jamais le
 * detail de l'erreur), comme les autres refus de ces actions.
 */
// Local: aucun consommateur hors de ce module (reserve S4 du contre-audit
// LOT 6). Le type de retour reste visible via la signature de la fonction.
type TenantAdminCheck =
  { error: string; actor: null } | { error: null; actor: AuthenticatedUserWithTenant };

export async function checkTenantAdminPermissions(tenantId: string): Promise<TenantAdminCheck> {
  const t = await getTranslations('errors');
  try {
    const actor = await getAuthenticatedUserForTenant(tenantId, 'team.manage');
    return { error: null, actor };
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) {
      return { error: t('notAuthenticated'), actor: null };
    }
    return { error: t('permissionDenied'), actor: null };
  }
}
