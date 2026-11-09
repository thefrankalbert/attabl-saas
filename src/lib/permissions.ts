// Resolution des permissions d'un membre d'un restaurant (ATTABL SaaS).
//
// UNE SEULE SOURCE DE VERITE: les codes PermissionCode, leur matrice par defaut
// (DEFAULT_PERMISSIONS) et les surcharges du proprietaire (role_permissions) et
// individuelles (custom_permissions). Le serveur, le middleware et l'interface
// lisent tous cette meme resolution. Il existait avant une seconde matrice
// "par role" (canManageMenus, canViewAllFinances...) lue seulement par
// l'interface: elle contredisait le serveur (un chef voyait "Ajouter un plat"
// puis se faisait refuser, un caissier etait bloque sur /orders) et ignorait
// les reglages du proprietaire. Elle a ete supprimee.

import type { AdminUser } from '@/types/admin.types';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
  type RolePermissions,
} from '@/types/permission.types';

/**
 * Check if an admin user has a specific permission.
 *
 * Resolution order:
 * 1. Individual override (custom_permissions on admin_users) - highest priority
 * 2. Role override (role_permissions per tenant) - medium priority
 * 3. Default matrix (hardcoded) - fallback
 *
 * Owner role always returns true (immutable).
 */
export function hasPermission(
  adminUser: Pick<AdminUser, 'role' | 'custom_permissions'>,
  perm: PermissionCode,
  roleOverrides?: Pick<RolePermissions, 'permissions'> | null,
): boolean {
  // Owner is immutable - always has all permissions
  if (adminUser.role === 'owner') {
    return true;
  }

  // 1. Check individual override
  if (adminUser.custom_permissions?.[perm] !== undefined) {
    return adminUser.custom_permissions[perm];
  }

  // 2. Check role override for this tenant
  if (roleOverrides?.permissions?.[perm] !== undefined) {
    return roleOverrides.permissions[perm] as boolean;
  }

  // 3. Fall back to default matrix
  const defaults = DEFAULT_PERMISSIONS[adminUser.role];
  if (!defaults) {
    return false;
  }

  return defaults[perm] ?? false;
}

/**
 * Get the full effective permissions map for a user.
 * Useful for UI rendering (show/hide sidebar items, buttons, etc.)
 */
export function getEffectivePermissions(
  adminUser: Pick<AdminUser, 'role' | 'custom_permissions'>,
  roleOverrides?: Pick<RolePermissions, 'permissions'> | null,
): Record<PermissionCode, boolean> {
  const result = {} as Record<PermissionCode, boolean>;

  for (const perm of PERMISSION_CODES) {
    result[perm] = hasPermission(adminUser, perm, roleOverrides);
  }

  return result;
}
