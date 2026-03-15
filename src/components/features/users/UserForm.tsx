'use client';

import { Users, UserPlus, Mail, Lock, Loader2, Send } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { buildRoleConfig } from '@/lib/role-config';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { AdminRole } from '@/types/admin.types';
import type { ModalTab, CreateUserFormData } from '@/hooks/useUsersData';

interface UserFormProps {
  activeTab: ModalTab;
  setActiveTab: (tab: ModalTab) => void;

  // Invitation form
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: string;
  setInviteRole: (role: string) => void;
  inviting: boolean;
  onSendInvitation: () => Promise<void>;

  // Direct creation form
  formData: CreateUserFormData;
  setFormData: (data: CreateUserFormData) => void;
  loading: boolean;
  onCreateUser: () => Promise<void>;

  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────

export default function UserForm({
  activeTab,
  setActiveTab,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviting,
  onSendInvitation,
  formData,
  setFormData,
  loading,
  onCreateUser,
  onClose,
}: UserFormProps) {
  const t = useTranslations('users');
  const seg = useSegmentTerms();

  const ROLE_CONFIG = buildRoleConfig(t);

  const INVITABLE_ROLE_CONFIG = Object.fromEntries(
    Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner'),
  ) as Record<string, (typeof ROLE_CONFIG)[AdminRole]>;

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex border-b border-app-border">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
            activeTab === 'invite'
              ? 'border-b-2 border-accent text-app-text font-medium'
              : 'text-app-text-muted hover:text-app-text-secondary',
          )}
          onClick={() => setActiveTab('invite')}
        >
          <Mail className="w-4 h-4" />
          {t('inviteByEmail')}
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
            activeTab === 'direct'
              ? 'border-b-2 border-accent text-app-text font-medium'
              : 'text-app-text-muted hover:text-app-text-secondary',
          )}
          onClick={() => setActiveTab('direct')}
        >
          <UserPlus className="w-4 h-4" />
          {t('directCreation')}
        </button>
      </div>

      {/* Tab Content: Invite by email */}
      {activeTab === 'invite' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('memberEmail')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
              <Input
                className="pl-9"
                type="email"
                placeholder={seg.emailPlaceholder}
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
            <p className="text-xs text-app-text-secondary mt-1">{t('roleDescription')}</p>
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
      )}

      {/* Tab Content: Direct creation */}
      {activeTab === 'direct' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('fullName')}</Label>
            <div className="relative">
              <Users className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
              <Input
                className="pl-9"
                placeholder={t('fullNamePlaceholder')}
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('professionalEmail')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
              <Input
                className="pl-9"
                type="email"
                placeholder={seg.emailPlaceholder}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('temporaryPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-app-text-muted" />
              <Input
                className="pl-9"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('roleAndPermissions')}</Label>
            <Select
              value={formData.role}
              onValueChange={(v: AdminRole) => setFormData({ ...formData, role: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key} disabled={key === 'owner'}>
                    <div className="flex items-center gap-2">
                      <config.icon className="w-4 h-4" />
                      <span>{config.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-app-text-secondary mt-1">{t('roleDescription')}</p>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button variant="default" onClick={onCreateUser} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('createAccount')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
