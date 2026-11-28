import {
  Briefcase,
  ChefHat,
  Coffee,
  ConciergeBell,
  CookingPot,
  CreditCard,
  Crown,
  Factory,
  Store,
  Users,
  Wine,
} from 'lucide-react';
import type { Poste } from '@/types/permission.types';

export type RoleConfigEntry = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

/**
 * Libelle, icone et couleur des 11 postes.
 * Pass `t` from `useTranslations('users')`.
 */
export function buildRoleConfig(t: (key: string) => string): Record<Poste, RoleConfigEntry> {
  return {
    owner: { label: t('roleOwner'), icon: Crown, color: 'text-amber-700', bg: 'bg-amber-100' },
    manager: {
      label: t('roleManager'),
      icon: Briefcase,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    chef: { label: t('roleChef'), icon: ChefHat, color: 'text-orange-600', bg: 'bg-orange-50' },
    cashier: {
      label: t('roleCashier'),
      icon: CreditCard,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    bartender: { label: t('roleBartender'), icon: Wine, color: 'text-pink-600', bg: 'bg-pink-50' },
    reception: {
      label: t('roleReception'),
      icon: ConciergeBell,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    waiter: { label: t('roleWaiter'), icon: Coffee, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    cook: { label: t('roleCook'), icon: CookingPot, color: 'text-orange-600', bg: 'bg-orange-50' },
    crew: { label: t('roleCrew'), icon: Users, color: 'text-sky-600', bg: 'bg-sky-50' },
    sales: { label: t('roleSales'), icon: Store, color: 'text-gray-600', bg: 'bg-gray-100' },
    production: {
      label: t('roleProduction'),
      icon: Factory,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  };
}

/** Repli pour un poste inconnu ou un membre sans poste. */
function buildDefaultRoleConfig(t: (key: string) => string): RoleConfigEntry {
  return {
    label: t('roleDefaultLabel'),
    icon: Users,
    color: 'text-neutral-600',
    bg: 'bg-neutral-50',
  };
}

/** Config d'un poste, avec repli. */
function getRoleConfig(poste: string, t: (key: string) => string): RoleConfigEntry {
  const config = buildRoleConfig(t);
  return config[poste as Poste] ?? buildDefaultRoleConfig(t);
}

/**
 * Une pastille par poste (cumul). Un membre sans poste recoit la pastille de
 * repli, pour ne jamais afficher une ligne vide.
 */
export function getPostesConfig(
  postes: readonly string[] | null | undefined,
  t: (key: string) => string,
): RoleConfigEntry[] {
  if (!postes || postes.length === 0) return [buildDefaultRoleConfig(t)];
  return postes.map((poste) => getRoleConfig(poste, t));
}
