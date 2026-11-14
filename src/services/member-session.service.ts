import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export type SessionRevocation = 'revoked' | 'kept_other_membership' | 'failed';

/**
 * Coupe les sessions d'un membre dont l'acces vient d'etre retire (A-04).
 *
 * Desactiver un membre ne touchait que la ligne admin_users: son jeton de
 * session restait valide. Les controles serveur refusent deja un membre inactif,
 * mais une session vivante garde tout ce que le navigateur a deja charge et
 * tout ce qui ne passe pas par une garde. On revoque donc la session elle-meme.
 *
 * Les sessions sont GLOBALES au compte (auth.sessions n'a pas de tenant). Si la
 * personne garde un acces actif dans un autre restaurant, couper sa session la
 * deconnecterait la-bas pour rien: dans ce cas on ne revoque pas, et c'est le
 * refus par membre (RLS + gardes serveur) qui protege ce restaurant. La
 * lecture des autres appartenances est donc volontairement inter-restaurants:
 * elle porte sur le compte, pas sur les donnees d'un tenant.
 */
export function createMemberSessionService(supabase: SupabaseClient) {
  return {
    async revokeSessionsAfterRemoval(
      tenantId: string,
      authUserId: string,
    ): Promise<SessionRevocation> {
      const { data: others, error: lookupError } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', authUserId)
        .neq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(1);

      if (lookupError) {
        // En cas de doute on coupe: une reconnexion coute moins qu'un acces maintenu.
        logger.warn('revokeSessionsAfterRemoval: lecture des autres acces impossible', {
          tenantId,
          error: lookupError.message,
        });
      } else if (others && others.length > 0) {
        return 'kept_other_membership';
      }

      const { error } = await supabase.rpc('revoke_user_sessions', { p_user_id: authUserId });
      if (error) {
        logger.error('revokeSessionsAfterRemoval: revocation des sessions refusee', {
          tenantId,
          error: error.message,
        });
        return 'failed';
      }
      return 'revoked';
    },
  };
}
