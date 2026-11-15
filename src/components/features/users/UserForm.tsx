'use client';

import { Mail, Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildRoleConfig } from '@/lib/role-config';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { AdminRole } from '@/types/admin.types';

interface UserFormProps {
  // Invitation form
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: string;
  setInviteRole: (role: string) => void;
  inviting: boolean;
  onSendInvitation: () => Promise<void>;

  onClose: () => void;
}

// --- Component ---------------------------------------------

export default function UserForm({
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviting,
  onSendInvitation,
  onClose,
}: UserFormProps) {
  const t = useTranslations('users');
  const seg = useSegmentTerms();

  const ROLE_CONFIG = buildRoleConfig(t);
  const ROLE_DESC_KEYS: Record<string, string> = {
    admin: 'roleDescAdmin',
    manager: 'roleDescManager',
    cashier: 'roleDescCashier',
    chef: 'roleDescChef',
    waiter: 'roleDescWaiter',
  };
  const roleDescription = (role: string) => (ROLE_DESC_KEYS[role] ? t(ROLE_DESC_KEYS[role]) : '');

  const INVITABLE_ROLE_CONFIG = Object.fromEntries(
    Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner'),
  ) as Record<string, (typeof ROLE_CONFIG)[AdminRole]>;

  return (
    <div className="space-y-4">
      {/* Seul chemin pour faire entrer du personnel: l'invitation (le titulaire du compte choisit son mot de passe). */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('memberEmail')}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
            <Input
              className="pl-9"
              type="email"
              placeholder={seg.emailPlaceholder}
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('roleAndPermissions')}</Label>
          <Select value={inviteRole} onValueChange={(v: string) => setInviteRole(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INVITABLE_ROLE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <config.icon className="w-4 h-4" />
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-app-text-secondary mt-1">{roleDescription(inviteRole)}</p>
        </div>

        <div className="pt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="default" onClick={onSendInvitation} disabled={inviting}>
            {inviting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {t('sendInvitation')}
          </Button>
        </div>
      </div>
    </div>
  );
}
