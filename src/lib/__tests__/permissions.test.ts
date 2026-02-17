import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  hasPermission,
  getRolePermissions,
  getVisibleNavItems,
  type RolePermissions,
} from '../permissions';
import type { AdminRole } from '@/types/admin.types';

const ALL_ROLES: AdminRole[] = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'];

describe('ROLE_PERMISSIONS', () => {
  it('should define permissions for all 6 roles', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('should have all expected keys for every role', () => {
    const expectedKeys: (keyof RolePermissions)[] = [
      'canManageMenus',
      'canViewMenuPrices',
      'canViewMenuDetails',
      'canViewAllFinances',
      'canViewOwnFinances',
      'canViewRestaurantRevenue',
      'canManageUsers',
      'canViewAllUsers',
      'canViewAllStats',
      'canViewOwnStats',
      'statsScope',
      'canManageStocks',
      'canViewStocks',
      'canManageOrders',
      'canTakeOrders',
      'canViewAllOrders',
      'canViewOwnOrders',
      'canManageSettings',
      'canConfigureKitchen',
      'canConfigurePOS',
      'availableViews',
      'defaultView',
    ];

    for (const role of ALL_ROLES) {
      for (const key of expectedKeys) {
        expect(ROLE_PERMISSIONS[role]).toHaveProperty(key);
      }
    }
  });
});

describe('owner permissions', () => {
  const perms = ROLE_PERMISSIONS.owner;

  it('should have full access to all boolean permissions', () => {
    expect(perms.canManageMenus).toBe(true);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canManageSettings).toBe(true);
    expect(perms.canManageStocks).toBe(true);
    expect(perms.canManageOrders).toBe(true);
    expect(perms.canViewAllFinances).toBe(true);
    expect(perms.canViewAllStats).toBe(true);
    expect(perms.canConfigureKitchen).toBe(true);
    expect(perms.canConfigurePOS).toBe(true);
  });

  it('should have statsScope "all"', () => {
    expect(perms.statsScope).toBe('all');
  });

  it('should have all 4 views available', () => {
    expect(perms.availableViews).toEqual(['standard', 'pos', 'kitchen', 'server']);
  });

  it('should default to standard view', () => {
    expect(perms.defaultView).toBe('standard');
  });
});

describe('chef permissions (corrected per MISE-A-JOUR spec)', () => {
  const perms = ROLE_PERMISSIONS.chef;

  it('should see all finances', () => {
    expect(perms.canViewAllFinances).toBe(true);
  });

  it('should see restaurant revenue', () => {
    expect(perms.canViewRestaurantRevenue).toBe(true);
  });

  it('should see all stats with restaurant scope', () => {
    expect(perms.canViewAllStats).toBe(true);
    expect(perms.statsScope).toBe('restaurant');
  });

  it('should manage orders and see all orders', () => {
    expect(perms.canManageOrders).toBe(true);
    expect(perms.canViewAllOrders).toBe(true);
  });

  it('should manage menus', () => {
    expect(perms.canManageMenus).toBe(true);
  });

  it('should NOT manage users or settings', () => {
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });

  it('should configure kitchen but NOT POS', () => {
    expect(perms.canConfigureKitchen).toBe(true);
    expect(perms.canConfigurePOS).toBe(false);
  });

  it('should have standard and kitchen views', () => {
    expect(perms.availableViews).toEqual(['standard', 'kitchen']);
    expect(perms.defaultView).toBe('kitchen');
  });
});

describe('waiter permissions (corrected per MISE-A-JOUR spec)', () => {
  const perms = ROLE_PERMISSIONS.waiter;

  it('should view menu details (for allergens/ingredients)', () => {
    expect(perms.canViewMenuDetails).toBe(true);
  });

  it('should view own finances', () => {
    expect(perms.canViewOwnFinances).toBe(true);
  });

  it('should view own stats with own scope', () => {
    expect(perms.canViewOwnStats).toBe(true);
    expect(perms.statsScope).toBe('own');
  });

  it('should NOT manage menus', () => {
    expect(perms.canManageMenus).toBe(false);
  });

  it('should NOT manage users, settings, stocks', () => {
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
    expect(perms.canManageStocks).toBe(false);
  });

  it('should take orders but NOT manage them', () => {
    expect(perms.canTakeOrders).toBe(true);
    expect(perms.canManageOrders).toBe(false);
  });

  it('should have standard and server views', () => {
    expect(perms.availableViews).toEqual(['standard', 'server']);
    expect(perms.defaultView).toBe('server');
  });
});

describe('cashier permissions', () => {
  const perms = ROLE_PERMISSIONS.cashier;

  it('should configure POS but NOT kitchen', () => {
    expect(perms.canConfigurePOS).toBe(true);
    expect(perms.canConfigureKitchen).toBe(false);
  });

  it('should have standard and pos views', () => {
    expect(perms.availableViews).toEqual(['standard', 'pos']);
    expect(perms.defaultView).toBe('pos');
  });

  it('should NOT manage users or settings', () => {
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canManageSettings).toBe(false);
  });
});

describe('manager permissions', () => {
  const perms = ROLE_PERMISSIONS.manager;

  it('should NOT manage users', () => {
    expect(perms.canManageUsers).toBe(false);
  });

  it('should NOT manage settings', () => {
    expect(perms.canManageSettings).toBe(false);
  });

  it('should manage menus and stocks', () => {
    expect(perms.canManageMenus).toBe(true);
    expect(perms.canManageStocks).toBe(true);
  });
});

describe('hasPermission()', () => {
  it('should return true for owner canManageUsers', () => {
    expect(hasPermission('owner', 'canManageUsers')).toBe(true);
  });

  it('should return false for waiter canManageUsers', () => {
    expect(hasPermission('waiter', 'canManageUsers')).toBe(false);
  });

  it('should handle non-boolean values (statsScope)', () => {
    expect(hasPermission('owner', 'statsScope')).toBe(true);
  });
});

describe('getRolePermissions()', () => {
  it('should return the full permissions object for a role', () => {
    const perms = getRolePermissions('admin');
    expect(perms).toBe(ROLE_PERMISSIONS.admin);
  });

  it('should return different objects for different roles', () => {
    expect(getRolePermissions('owner')).not.toBe(getRolePermissions('waiter'));
  });
});

describe('getVisibleNavItems()', () => {
  const navItems = [
    { label: 'Dashboard' },
    { label: 'Users', requiredPermission: 'canManageUsers' as const },
    { label: 'Settings', requiredPermission: 'canManageSettings' as const },
    { label: 'Orders', requiredPermission: null },
    { label: 'Menus', requiredPermission: 'canManageMenus' as const },
  ];

  it('should show all items for owner', () => {
    const visible = getVisibleNavItems('owner', navItems);
    expect(visible).toHaveLength(5);
  });

  it('should filter restricted items for waiter', () => {
    const visible = getVisibleNavItems('waiter', navItems);
    const labels = visible.map((i) => i.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Orders');
    expect(labels).not.toContain('Users');
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Menus');
  });

  it('should show items with null requiredPermission', () => {
    const visible = getVisibleNavItems('cashier', navItems);
    const labels = visible.map((i) => i.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Orders');
  });

  it('should show menus for chef', () => {
    const visible = getVisibleNavItems('chef', navItems);
    const labels = visible.map((i) => i.label);
    expect(labels).toContain('Menus');
  });
});
