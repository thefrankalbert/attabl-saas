import type { PermissionCode } from '@/types/permission.types';

/**
 * Regroupement des 22 droits pour l'affichage (ecran des droits par poste et
 * reglage par personne). Chaque code y figure une seule fois : un test le
 * verifie, pour qu'un droit ajoute au catalogue ne reste pas invisible.
 */
export const PERMISSION_CATEGORIES: { key: string; permissions: PermissionCode[] }[] = [
  { key: 'menu', permissions: ['menu.view', 'menu.edit', 'menu.price'] },
  {
    key: 'orders',
    permissions: [
      'orders.take',
      'kitchen.track',
      'orders.cancel',
      'orders.discount',
      'orders.refund',
    ],
  },
  { key: 'cash', permissions: ['orders.pay', 'cash.close', 'cash.count'] },
  { key: 'reports', permissions: ['reports.menu', 'reports.money', 'reports.own'] },
  { key: 'inventory', permissions: ['inventory.view', 'inventory.edit', 'suppliers.manage'] },
  { key: 'team', permissions: ['team.view', 'team.manage'] },
  { key: 'settings', permissions: ['settings.edit', 'audit.view', 'billing.manage'] },
];

/**
 * Sens du niveau borne (`limited`) de chaque droit qui peut l'etre, en cle
 * i18n sous `permissions.limited`. Affiche en texte a cote du droit.
 */
export const LIMITED_HINT_KEYS: Partial<
  Record<PermissionCode, 'code' | 'merchantQr' | 'invoices'>
> = {
  'orders.cancel': 'code',
  'orders.discount': 'code',
  'orders.refund': 'code',
  'orders.pay': 'merchantQr',
  'billing.manage': 'invoices',
};

/** Cle i18n du libelle d'un droit (`permissions.perm.<cle>`). */
export const permissionLabelKey = (perm: PermissionCode): string => perm.replace('.', '_');
