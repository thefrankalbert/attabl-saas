import type { SupabaseClient } from '@supabase/supabase-js';

import { loadPosteOverrides } from '@/lib/auth/member-rights';
import { canManageInvitationRights } from '@/lib/auth/poste-authority';
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
 * Meme regle que pour DONNER des postes (`canManageInvitationRights`) : il
 * faut `team.manage`, et les droits que l'invitation donnerait ne doivent pas
 * depasser ceux de l'appelant (inclus ou egal). Un gerant gere donc
 * l'invitation de gerant qu'il a envoyee, mais pas une invitation a laquelle le
 * proprietaire a ajoute un droit que lui n'a pas. Le proprietaire agit sur
 * toutes.
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
  if (!actor) return false;

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

  return canManageInvitationRights(actor, getEffectiveLevels(invited, overrides));
}
