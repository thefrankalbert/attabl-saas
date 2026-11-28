'use client';

import { Mail, Loader2, RefreshCw, Clock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPostesConfig } from '@/lib/role-config';
import { ListRowsSkeleton } from '@/components/admin/skeletons/ListRowsSkeleton';
import { canManageInvitationRights, type TeamActor } from '@/lib/auth/poste-authority';
import { getEffectiveLevels, type PosteOverrides } from '@/lib/permissions';
import type { Invitation } from '@/types/invitation.types';
import { timeAgo, timeUntil } from '@/hooks/useUsersData';

interface PendingInvitationsProps {
  /** L'acteur et les reglages du restaurant, pour la regle par ligne. */
  actor: Pick<TeamActor, 'isOwner' | 'levels'>;
  posteOverrides: PosteOverrides;
  pendingOnly: Invitation[];
  loadingInvitations: boolean;
  resendingId: string | null;
  cancellingId: string | null;
  onResend: (invitationId: string) => Promise<void>;
  onCancel: (invitationId: string) => Promise<void>;
}

// --- Component ---------------------------------------------

export default function PendingInvitations({
  actor,
  posteOverrides,
  pendingOnly,
  loadingInvitations,
  resendingId,
  cancellingId,
  onResend,
  onCancel,
}: PendingInvitationsProps) {
  const t = useTranslations('users');
  const expiryLabel = (expiresAt: string): string => {
    const left = timeUntil(expiresAt, t);
    return left ? t('expiresIn', { time: left }) : t('invitationExpired');
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t('pendingInvitationsTitle')}</h2>

      {loadingInvitations ? (
        <ListRowsSkeleton rows={3} />
      ) : pendingOnly.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-border p-8 text-center text-app-text-secondary">
          {t('noPendingInvitations')}
        </div>
      ) : (
        <div className="grid gap-3">
          {pendingOnly.map((invitation) => {
            const badges = getPostesConfig(invitation.postes, t);
            // Meme regle que les deux routes (`canManageInvitation`): pas de
            // bouton qui finirait en refus.
            const canManage = canManageInvitationRights(
              actor,
              getEffectiveLevels(
                {
                  postes: invitation.postes,
                  permission_overrides: invitation.permission_overrides,
                },
                posteOverrides,
              ),
            );
            return (
              <div
                key={invitation.id}
                className="rounded-xl border border-dashed border-app-border p-4"
              >
                {/* Telephone: les boutons passent SOUS le texte. Sur une seule
                    ligne a 375 px, "Annuler" sortait de la carte (coupe a "A"). */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Mail className="w-5 h-5 text-app-text-muted mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-app-text">{invitation.email}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-text-secondary">
                        {badges.map((badge) => (
                          <div
                            key={badge.label}
                            className={cn(
                              'px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
                              badge.bg,
                              badge.color,
                            )}
                          >
                            <badge.icon className="w-3 h-3" />
                            {badge.label}
                          </div>
                        ))}
                        <span>{t('sentAgo', { time: timeAgo(invitation.created_at, t) })}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {expiryLabel(invitation.expires_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => onResend(invitation.id)}
                        disabled={resendingId === invitation.id}
                      >
                        {resendingId === invitation.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {t('resend')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-status-error hover:text-status-error hover:bg-status-error-bg"
                        onClick={() => onCancel(invitation.id)}
                        disabled={cancellingId === invitation.id}
                      >
                        {cancellingId === invitation.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
