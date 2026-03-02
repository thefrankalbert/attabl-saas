'use client';

import { Mail, Loader2, RefreshCw, Clock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getRoleConfig } from '@/lib/role-config';
import type { Invitation } from '@/types/invitation.types';
import { timeAgo, timeUntil } from '@/hooks/useUsersData';

interface PendingInvitationsProps {
  pendingOnly: Invitation[];
  loadingInvitations: boolean;
  resendingId: string | null;
  cancellingId: string | null;
  onResend: (invitationId: string) => Promise<void>;
  onCancel: (invitationId: string) => Promise<void>;
}

// ─── Component ─────────────────────────────────────────────

export default function PendingInvitations({
  pendingOnly,
  loadingInvitations,
  resendingId,
  cancellingId,
  onResend,
  onCancel,
}: PendingInvitationsProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t('pendingInvitationsTitle')}</h2>

      {loadingInvitations ? (
        <div className="flex items-center justify-center py-8 text-app-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          {tc('loading')}
        </div>
      ) : pendingOnly.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-border p-8 text-center text-app-text-secondary">
          {t('noPendingInvitations')}
        </div>
      ) : (
        <div className="grid gap-3">
          {pendingOnly.map((invitation) => {
            const roleConfig = getRoleConfig(invitation.role, t);
            const RoleIcon = roleConfig.icon;
            return (
              <div
                key={invitation.id}
                className="rounded-xl border border-dashed border-app-border p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-app-text-muted mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-app-text">{invitation.email}</p>
                      <div className="flex items-center gap-3 text-xs text-app-text-secondary">
                        <div
                          className={cn(
                            'px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
                            roleConfig.bg,
                            roleConfig.color,
                          )}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {roleConfig.label}
                        </div>
                        <span>{t('sentAgo', { time: timeAgo(invitation.created_at) })}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t('expiresIn', { time: timeUntil(invitation.expires_at) })}
                        </span>
                      </div>
                    </div>
                  </div>
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
                      className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-600 hover:bg-red-500/10"
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
