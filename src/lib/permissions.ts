// Centralized role-based permissions for ATTABL SaaS
// Defines what each AdminRole can access across the platform

import type { AdminRole } from '@/types/admin.types';

// ─── View Types ──────────────────────────────────────────────
export type ViewType = 'standard' | 'pos' | 'kitchen' | 'server';

// ─── Stats Scope ─────────────────────────────────────────────
export type StatsScope = 'all' | 'restaurant' | 'quantities' | 'own';

// ─── Permission Interface ────────────────────────────────────
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

  // Admin (gérant): full access, restaurant-scoped stats
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

// ─── Helper Functions ────────────────────────────────────────

/**
 * Check if a role has a specific boolean permission.
 */
export function hasPermission(role: AdminRole, permission: keyof RolePermissions): boolean {
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
    return hasPermission(role, item.requiredPermission);
  });
}
