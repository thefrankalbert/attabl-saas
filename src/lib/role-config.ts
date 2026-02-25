import { Crown, Shield, Users, CreditCard, ChefHat, Coffee } from 'lucide-react';
import type { AdminRole } from '@/types/admin.types';

export type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

/**
 * Build the full role UI config with translated labels.
 * Pass `t` from `useTranslations('users')`.
 */
export function buildRoleConfig(t: (key: string) => string): Record<AdminRole, RoleConfigEntry> {
  return {
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
    waiter: { label: t('roleWaiter'), icon: Coffee, color: 'text-green-600', bg: 'bg-green-50' },
  };
}

/** Default fallback for unknown roles. */
export function buildDefaultRoleConfig(t: (key: string) => string): RoleConfigEntry {
  return {
    label: t('roleDefaultLabel'),
    icon: Users,
    color: 'text-neutral-600',
    bg: 'bg-neutral-50',
  };
}

/** Get config for a single role with fallback. */
export function getRoleConfig(role: string, t: (key: string) => string): RoleConfigEntry {
  const config = buildRoleConfig(t);
  return config[role as AdminRole] ?? buildDefaultRoleConfig(t);
}
