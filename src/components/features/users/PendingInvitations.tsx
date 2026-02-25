'use client';

import {
  Users,
  Shield,
  CreditCard,
  ChefHat,
  Coffee,
  Mail,
  Loader2,
  Crown,
  RefreshCw,
  Clock,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@/types/admin.types';
import type { Invitation } from '@/types/invitation.types';
import { timeAgo, timeUntil } from '@/hooks/useUsersData';

// ─── Types ─────────────────────────────────────────────────

type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

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

  const ROLE_CONFIG: Record<AdminRole, RoleConfigEntry> = {
    owner: { label: t('roleOwner'), icon: Crown, color: 'text-lime-700', bg: 'bg-lime-100' },
    admin: { label: t('roleAdmin'), icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50' },
    manager: { label: t('roleManager'), icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    cashier: {
      label: t('roleCashier'),
      icon: CreditCard,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    chef: { label: t('roleChef'), icon: ChefHat, color: 'text-orange-600', bg: 'bg-orange-50' },
    waiter: {
      label: t('roleWaiter'),
      icon: Coffee,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  };

  const DEFAULT_ROLE_CONFIG: RoleConfigEntry = {
    label: t('roleUser'),
    icon: Users,
    color: 'text-neutral-600',
    bg: 'bg-neutral-50',
  };

  function getRoleConfig(role: string): RoleConfigEntry {
    return ROLE_CONFIG[role as AdminRole] ?? DEFAULT_ROLE_CONFIG;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Invitations en attente</h2>

      {loadingInvitations ? (
        <div className="flex items-center justify-center py-8 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement...
        </div>
      ) : pendingOnly.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          Aucune invitation en attente
        </div>
      ) : (
        <div className="grid gap-3">
          {pendingOnly.map((invitation) => {
            const roleConfig = getRoleConfig(invitation.role);
            const RoleIcon = roleConfig.icon;
            return (
              <div
                key={invitation.id}
                className="rounded-xl border border-dashed border-neutral-300 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-neutral-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium text-neutral-900">{invitation.email}</p>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
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
                        <span>Envoyee il y a {timeAgo(invitation.created_at)}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expire dans {timeUntil(invitation.expires_at)}
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
                      Renvoyer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onCancel(invitation.id)}
                      disabled={cancellingId === invitation.id}
                    >
                      {cancellingId === invitation.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      Annuler
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
