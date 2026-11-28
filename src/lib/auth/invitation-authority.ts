import type { SupabaseClient } from '@supabase/supabase-js';

import { loadPosteOverrides } from '@/lib/auth/member-rights';
import { canActOnMember } from '@/lib/auth/poste-authority';
import { resolveLiveMember } from '@/lib/auth/resolve-admin-permission';
import { getEffectiveLevels, toPermissionMap, toPostes } from '@/lib/permissions';

interface InvitationRights {
  tenant_id: string;
  postes: unknown;
  permission_overrides: unknown;
}

/**
 * L'appelant peut-il annuler ou renvoyer cette invitation ?
 *
 * Meme regle que pour un membre (`canActOnMember`) : il faut `team.manage`, et
 * les droits que l'invitation donnerait doivent etre STRICTEMENT inclus dans
 * ceux de l'appelant. Un gerant ne touche donc pas a l'invitation d'un autre
 * gerant posee par le proprietaire. Le proprietaire agit sur toutes.
 *
 * `sessionClient` porte la session de l'appelant (ses droits) ; `adminClient`
 * lit les reglages du restaurant. ECHEC FERME sur toute lecture en panne.
 */
export async function canManageInvitation(
  sessionClient: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  invitation: InvitationRights,
): Promise<boolean> {
  const actor = await resolveLiveMember(sessionClient, userId, invitation.tenant_id);
  if (!actor || actor.levels['team.manage'] !== 'full') return false;

  const invited = {
    postes: toPostes(invitation.postes),
    permission_overrides: toPermissionMap(invitation.permission_overrides),
  };
  const { overrides, failed } = await loadPosteOverrides(
    adminClient,
    invitation.tenant_id,
    invited.postes,
  );
  if (failed) return false;

  return canActOnMember(
    { id: actor.adminUserId, isOwner: actor.isOwner, levels: actor.levels },
    // Une invitation n'est pas une ligne de membre : son identifiant ne peut
    // pas etre celui de l'appelant.
    { id: '', postes: invited.postes, levels: getEffectiveLevels(invited, overrides) },
  );
}
