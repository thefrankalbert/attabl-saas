import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { loadPosteOverrides } from '@/lib/auth/member-rights';
import { canActOnMember } from '@/lib/auth/poste-authority';
import { getEffectiveLevels, isOwner, toPermissionMap, toPostes } from '@/lib/permissions';
import { checkTargetAccountScope } from '@/lib/auth/target-account-scope';
import { signEmailChangeToken, type EmailChangeClaims } from '@/lib/auth/email-change-token';
import { sendEmailChangeConfirmationEmail } from '@/services/email.service';

export type EmailChangeOutcome =
  'expired' | 'refused' | 'failed' | 'new_address_notified' | 'applied';

/**
 * Applique UNE etape du changement d'adresse d'un membre (A-09). Appele par le
 * POST de confirmation, jamais par un simple GET.
 *
 * Chaine: etape `current` (l'adresse actuelle approuve) -> envoi du lien a la
 * NOUVELLE adresse -> etape `new` (elle approuve) -> le changement est applique.
 *
 * A chaque etape on RELIT l'etat, car le jeton date de la demande et le monde a
 * pu bouger depuis (contre-audit M1):
 *  - le compte a toujours l'adresse et le nonce du jeton (sinon: caduc);
 *  - le demandeur est toujours membre actif du restaurant, detient toujours
 *    `team.manage`, et a toujours autorite sur la cible (`canActOnMember`);
 *  - le compte est toujours entierement contenu dans ce restaurant (garde de
 *    perimetre stricte, aucune appartenance retiree ignoree).
 */
export function createEmailChangeService(supabase: SupabaseClient) {
  async function authorizationStillHolds(claims: EmailChangeClaims): Promise<boolean> {
    const { data: requester } = await supabase
      .from('admin_users')
      .select('id, postes, permission_overrides, is_active')
      .eq('id', claims.requesterId)
      .eq('tenant_id', claims.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!requester || requester.is_active === false) return false;

    const { data: target } = await supabase
      .from('admin_users')
      .select('id, postes, permission_overrides')
      .eq('user_id', claims.userId)
      .eq('tenant_id', claims.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!target) return false;

    // Droits EFFECTIFS des deux, relus maintenant. ECHEC FERME si les reglages
    // du restaurant ne se lisent pas.
    const actorMember = {
      postes: toPostes(requester.postes),
      permission_overrides: toPermissionMap(requester.permission_overrides),
    };
    const targetMember = {
      postes: toPostes(target.postes),
      permission_overrides: toPermissionMap(target.permission_overrides),
    };
    const { overrides, failed } = await loadPosteOverrides(supabase, claims.tenantId, [
      ...actorMember.postes,
      ...targetMember.postes,
    ]);
    if (failed) return false;
    const actorLevels = getEffectiveLevels(actorMember, overrides);
    if (actorLevels['team.manage'] !== 'full') return false;
    if (
      !canActOnMember(
        { id: requester.id, isOwner: isOwner(actorMember), levels: actorLevels },
        {
          id: target.id,
          postes: targetMember.postes,
          levels: getEffectiveLevels(targetMember, overrides),
        },
      )
    ) {
      return false;
    }

    const scope = await checkTargetAccountScope(supabase, claims.userId, claims.tenantId);
    return scope.allowed;
  }

  return {
    async confirmStep(claims: EmailChangeClaims): Promise<EmailChangeOutcome> {
      const { data: current, error: lookupError } = await supabase.auth.admin.getUserById(
        claims.userId,
      );
      const authUser = current?.user;
      if (
        lookupError ||
        !authUser ||
        authUser.email?.toLowerCase() !== claims.fromEmail ||
        authUser.app_metadata?.email_change_nonce !== claims.nonce
      ) {
        return 'expired';
      }

      if (!(await authorizationStillHolds(claims))) {
        logger.warn('Email change refused: authorization no longer holds', {
          tenantId: claims.tenantId,
          step: claims.step,
        });
        return 'refused';
      }

      if (claims.step === 'current') {
        const token = signEmailChangeToken({ ...claims, step: 'new' });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
        const sent = await sendEmailChangeConfirmationEmail(claims.toEmail, {
          confirmUrl: `${appUrl}/auth/confirm-email-change?token=${encodeURIComponent(token)}`,
        });
        return sent ? 'new_address_notified' : 'failed';
      }

      // Etape `new`: la nouvelle adresse vient de prouver qu'elle recoit le courrier
      // (email_confirm), et le nonce est efface: le jeton ne sert qu'une fois.
      const { error: updateError } = await supabase.auth.admin.updateUserById(claims.userId, {
        email: claims.toEmail,
        email_confirm: true,
        app_metadata: { email_change_nonce: null },
      });
      if (updateError) {
        logger.error('Email change failed at the auth account', { error: updateError.message });
        return 'failed';
      }

      // Miroir applicatif, borne au restaurant demandeur. S'il n'est pas ecrit,
      // l'identite et l'equipe divergeraient: on RESTAURE l'adresse d'origine.
      const { data: mirrored, error: mirrorError } = await supabase
        .from('admin_users')
        .update({ email: claims.toEmail })
        .eq('user_id', claims.userId)
        .eq('tenant_id', claims.tenantId)
        .select('id');
      if (mirrorError || !mirrored || mirrored.length === 0) {
        logger.error('Email change: mirror not updated, rolling back the auth email', {
          tenantId: claims.tenantId,
          error: mirrorError?.message,
        });
        const { error: rollbackError } = await supabase.auth.admin.updateUserById(claims.userId, {
          email: claims.fromEmail,
          email_confirm: true,
        });
        if (rollbackError) {
          logger.error('Email change: ROLLBACK FAILED, auth and admin_users diverge', {
            tenantId: claims.tenantId,
            error: rollbackError.message,
          });
        }
        return 'failed';
      }
      return 'applied';
    },
  };
}
