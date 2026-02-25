'use client';

import {
  Users,
  UserPlus,
  Shield,
  CreditCard,
  ChefHat,
  Coffee,
  Mail,
  Lock,
  Loader2,
  Crown,
  Send,
} from 'lucide-react';
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
import type { AdminRole } from '@/types/admin.types';
import type { ModalTab, CreateUserFormData } from '@/hooks/useUsersData';

// ─── Types ─────────────────────────────────────────────────

type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

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

  const INVITABLE_ROLE_CONFIG = Object.fromEntries(
    Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner'),
  ) as Record<string, RoleConfigEntry>;

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex border-b border-neutral-200">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
            activeTab === 'invite'
              ? 'border-b-2 border-[#CCFF00] text-black font-medium'
              : 'text-neutral-400 hover:text-neutral-600',
          )}
          onClick={() => setActiveTab('invite')}
        >
          <Mail className="w-4 h-4" />
          Inviter par email
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
            activeTab === 'direct'
              ? 'border-b-2 border-[#CCFF00] text-black font-medium'
              : 'text-neutral-400 hover:text-neutral-600',
          )}
          onClick={() => setActiveTab('direct')}
        >
          <UserPlus className="w-4 h-4" />
          Creation directe
        </button>
      </div>

      {/* Tab Content: Invite by email */}
      {activeTab === 'invite' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email du membre</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input
                className="pl-9"
                type="email"
                placeholder={t('emailPlaceholder')}
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
            <p className="text-xs text-neutral-500 mt-1">{t('roleDescription')}</p>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button variant="lime" onClick={onSendInvitation} disabled={inviting}>
              {inviting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Envoyer l&apos;invitation
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
              <Users className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
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
              <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              <Input
                className="pl-9"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('temporaryPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
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
            <p className="text-xs text-neutral-500 mt-1">{t('roleDescription')}</p>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button variant="lime" onClick={onCreateUser} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('createAccount')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
