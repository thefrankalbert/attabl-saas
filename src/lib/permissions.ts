// Centralized role-based permissions for ATTABL SaaS
// Defines what each AdminRole can access across the platform
//
// This module provides two permission APIs:
// 1. Legacy role-matrix API: hasPermission(role, permission) — used by admin sidebar/nav
// 2. New 3-level override API: hasPermission(adminUser, permCode, roleOverrides?) — used by permission checks

import type { AdminRole, AdminUser } from '@/types/admin.types';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
  type RolePermissions as NewRolePermissions,
} from '@/types/permission.types';

// ─── View Types ──────────────────────────────────────────────
export type ViewType = 'standard' | 'pos' | 'kitchen' | 'server';

// ─── Stats Scope ─────────────────────────────────────────────
export type StatsScope = 'all' | 'restaurant' | 'quantities' | 'own';

// ─── Legacy Permission Interface (role matrix) ──────────────
export interface RolePermissions {
  // Menu
  canManageMenus: boolean;
  canViewMenuPrices: boolean;
  canViewMenuDetails: boolean;

  // Finance
  canViewAllFinances: boolean;
  canViewOwnFinances: boolean;
  canViewRestaurantRevenue: boolean;

  // Users
  canManageUsers: boolean;
  canViewAllUsers: boolean;

  // Stats
  canViewAllStats: boolean;
  canViewOwnStats: boolean;
  statsScope: StatsScope;

  // Stocks
  canManageStocks: boolean;
  canViewStocks: boolean;

  // Orders
  canManageOrders: boolean;
  canTakeOrders: boolean;
  canViewAllOrders: boolean;
  canViewOwnOrders: boolean;

  // Config
  canManageSettings: boolean;
  canConfigureKitchen: boolean;
  canConfigurePOS: boolean;

  // Views
  availableViews: ViewType[];
  defaultView: ViewType;
}

// ─── Role Permission Definitions ─────────────────────────────

export const ROLE_PERMISSIONS: Record<AdminRole, RolePermissions> = {
  // Owner (superadmin): full access to everything
  owner: {
    canManageMenus: true,
    canViewMenuPrices: true,
    canViewMenuDetails: true,
    canViewAllFinances: true,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: true,
    canManageUsers: true,
    canViewAllUsers: true,
    canViewAllStats: true,
    canViewOwnStats: true,
    statsScope: 'all',
    canManageStocks: true,
    canViewStocks: true,
    canManageOrders: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrders: true,
    canManageSettings: true,
    canConfigureKitchen: true,
    canConfigurePOS: true,
    availableViews: ['standard', 'pos', 'kitchen', 'server'],
    defaultView: 'standard',
  },

  // Admin (gerant): full access, restaurant-scoped stats
  admin: {
    canManageMenus: true,
    canViewMenuPrices: true,
    canViewMenuDetails: true,
    canViewAllFinances: true,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: true,
    canManageUsers: true,
    canViewAllUsers: true,
    canViewAllStats: true,
    canViewOwnStats: true,
    statsScope: 'restaurant',
    canManageStocks: true,
    canViewStocks: true,
    canManageOrders: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrders: true,
    canManageSettings: true,
    canConfigureKitchen: true,
    canConfigurePOS: true,
    availableViews: ['standard', 'pos', 'kitchen', 'server'],
    defaultView: 'standard',
  },

  // Manager: operational management, no user management or global settings
  manager: {
    canManageMenus: true,
    canViewMenuPrices: true,
    canViewMenuDetails: true,
    canViewAllFinances: true,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: true,
    canManageUsers: false,
    canViewAllUsers: true,
    canViewAllStats: true,
    canViewOwnStats: true,
    statsScope: 'restaurant',
    canManageStocks: true,
    canViewStocks: true,
    canManageOrders: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrders: true,
    canManageSettings: false,
    canConfigureKitchen: true,
    canConfigurePOS: true,
    availableViews: ['standard', 'pos', 'kitchen', 'server'],
    defaultView: 'standard',
  },

  // Chef: kitchen-focused, sees finances/stats for menu optimization
  chef: {
    canManageMenus: true,
    canViewMenuPrices: true,
    canViewMenuDetails: true,
    canViewAllFinances: true,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: true,
    canManageUsers: false,
    canViewAllUsers: true,
    canViewAllStats: true,
    canViewOwnStats: true,
    statsScope: 'restaurant',
    canManageStocks: false,
    canViewStocks: true,
    canManageOrders: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrders: true,
    canManageSettings: false,
    canConfigureKitchen: true,
    canConfigurePOS: false,
    availableViews: ['standard', 'kitchen'],
    defaultView: 'kitchen',
  },

  // Waiter (serveur): order-taking, needs menu details for allergens/ingredients
  waiter: {
    canManageMenus: false,
    canViewMenuPrices: true,
    canViewMenuDetails: true,
    canViewAllFinances: false,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: false,
    canManageUsers: false,
    canViewAllUsers: false,
    canViewAllStats: false,
    canViewOwnStats: true,
    statsScope: 'own',
    canManageStocks: false,
    canViewStocks: false,
    canManageOrders: false,
    canTakeOrders: true,
    canViewAllOrders: false,
    canViewOwnOrders: true,
    canManageSettings: false,
    canConfigureKitchen: false,
    canConfigurePOS: false,
    availableViews: ['standard', 'server'],
    defaultView: 'server',
  },

  // Cashier (caissier): POS-focused, own financial visibility
  cashier: {
    canManageMenus: false,
    canViewMenuPrices: true,
    canViewMenuDetails: false,
    canViewAllFinances: false,
    canViewOwnFinances: true,
    canViewRestaurantRevenue: false,
    canManageUsers: false,
    canViewAllUsers: false,
    canViewAllStats: false,
    canViewOwnStats: true,
    statsScope: 'own',
    canManageStocks: false,
    canViewStocks: false,
    canManageOrders: false,
    canTakeOrders: true,
    canViewAllOrders: false,
    canViewOwnOrders: true,
    canManageSettings: false,
    canConfigureKitchen: false,
    canConfigurePOS: true,
    availableViews: ['standard', 'pos'],
    defaultView: 'pos',
  },
};

// ─── Legacy Helper Functions ─────────────────────────────────

/**
 * Check if a role has a specific boolean permission (legacy role-matrix API).
 */
function hasLegacyPermission(role: AdminRole, permission: keyof RolePermissions): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  const value = permissions[permission];
  if (typeof value === 'boolean') {
    return value;
  }
  return Boolean(value);
}

/**
 * Get the full permissions object for a given role.
 */
export function getRolePermissions(role: AdminRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

// ─── Navigation Filtering ────────────────────────────────────

export type NavItemPermission = keyof RolePermissions | null;

/**
 * Filter navigation items based on a role's permissions.
 * Items with `null` or undefined `requiredPermission` are always visible.
 */
export function getVisibleNavItems<T extends { requiredPermission?: NavItemPermission }>(
  role: AdminRole,
  items: T[],
): T[] {
  return items.filter((item) => {
    if (item.requiredPermission === undefined || item.requiredPermission === null) {
      return true;
    }
    return hasLegacyPermission(role, item.requiredPermission);
  });
}

// ─── New 3-Level Permission Override API ─────────────────────

/**
 * Check if an admin user has a specific permission.
 *
 * Resolution order:
 * 1. Individual override (custom_permissions on admin_users) — highest priority
 * 2. Role override (role_permissions per tenant) — medium priority
 * 3. Default matrix (hardcoded) — fallback
 *
 * Owner role always returns true (immutable).
 *
 * Also supports legacy call signature: hasPermission(role, legacyPermission)
 */
export function hasPermission(
  adminUserOrRole: AdminUser | AdminRole,
  permission: PermissionCode | keyof RolePermissions,
  roleOverrides?: NewRolePermissions | null,
): boolean {
  // Legacy API: hasPermission(role: AdminRole, permission: keyof RolePermissions)
  if (typeof adminUserOrRole === 'string') {
    return hasLegacyPermission(adminUserOrRole as AdminRole, permission as keyof RolePermissions);
  }

  // New API: hasPermission(adminUser: AdminUser, permission: PermissionCode, roleOverrides?)
  const adminUser = adminUserOrRole;
  const perm = permission as PermissionCode;

  // Owner is immutable — always has all permissions
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
  adminUser: AdminUser,
  roleOverrides?: NewRolePermissions | null,
): Record<PermissionCode, boolean> {
  const result = {} as Record<PermissionCode, boolean>;

  for (const perm of PERMISSION_CODES) {
    result[perm] = hasPermission(adminUser, perm, roleOverrides);
  }

  return result;
}
