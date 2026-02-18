import { describe, it, expect } from 'vitest';
import { hasPermission, getEffectivePermissions } from '../permissions';
import type { AdminUser } from '@/types/admin.types';
import type { RolePermissions } from '@/types/permission.types';

const makeUser = (role: string, custom?: Record<string, boolean> | null): AdminUser =>
  ({
    id: 'u1',
    user_id: 'auth-1',
    tenant_id: 't1',
    email: 'test@test.com',
    role,
    is_active: true,
    created_at: new Date().toISOString(),
    custom_permissions: custom ?? null,
  }) as AdminUser;

const makeRoleOverride = (role: string, perms: Record<string, boolean>): RolePermissions => ({
  id: 'rp1',
  tenant_id: 't1',
  role,
  permissions: perms,
  updated_at: new Date().toISOString(),
  updated_by: null,
});

describe('hasPermission', () => {
  describe('default matrix (no overrides)', () => {
    it('owner has all permissions', () => {
      const user = makeUser('owner');
      expect(hasPermission(user, 'menu.edit')).toBe(true);
      expect(hasPermission(user, 'settings.edit')).toBe(true);
      expect(hasPermission(user, 'team.manage')).toBe(true);
    });

    it('waiter can view menu and orders but not manage orders', () => {
      const user = makeUser('waiter');
      expect(hasPermission(user, 'menu.view')).toBe(true);
      expect(hasPermission(user, 'orders.view')).toBe(true);
      expect(hasPermission(user, 'orders.manage')).toBe(false);
    });

    it('chef can view inventory but not edit it', () => {
      const user = makeUser('chef');
      expect(hasPermission(user, 'inventory.view')).toBe(true);
      expect(hasPermission(user, 'inventory.edit')).toBe(false);
    });

    it('cashier can use POS but not view reports', () => {
      const user = makeUser('cashier');
      expect(hasPermission(user, 'pos.use')).toBe(true);
      expect(hasPermission(user, 'reports.view')).toBe(false);
    });

    it('manager cannot manage team or settings', () => {
      const user = makeUser('manager');
      expect(hasPermission(user, 'team.manage')).toBe(false);
      expect(hasPermission(user, 'settings.edit')).toBe(false);
    });
  });

  describe('role-level overrides', () => {
    it('role override grants permission not in defaults', () => {
      const user = makeUser('waiter');
      const override = makeRoleOverride('waiter', { 'orders.manage': true });
      expect(hasPermission(user, 'orders.manage', override)).toBe(true);
    });

    it('role override revokes permission from defaults', () => {
      const user = makeUser('manager');
      const override = makeRoleOverride('manager', { 'reports.view': false });
      expect(hasPermission(user, 'reports.view', override)).toBe(false);
    });

    it('role override does not affect unspecified permissions', () => {
      const user = makeUser('cashier');
      const override = makeRoleOverride('cashier', { 'reports.view': true });
      expect(hasPermission(user, 'reports.view', override)).toBe(true);
      expect(hasPermission(user, 'pos.use', override)).toBe(true);
    });
  });

  describe('individual overrides (custom_permissions)', () => {
    it('individual override takes precedence over role override', () => {
      const user = makeUser('waiter', { 'orders.manage': false });
      const roleOverride = makeRoleOverride('waiter', { 'orders.manage': true });
      expect(hasPermission(user, 'orders.manage', roleOverride)).toBe(false);
    });

    it('individual override takes precedence over defaults', () => {
      const user = makeUser('waiter', { 'inventory.view': true });
      expect(hasPermission(user, 'inventory.view')).toBe(true);
    });

    it('individual override does not affect other permissions', () => {
      const user = makeUser('waiter', { 'inventory.view': true });
      expect(hasPermission(user, 'orders.manage')).toBe(false);
    });
  });

  describe('owner immutability', () => {
    it('owner always has all permissions regardless of overrides', () => {
      const user = makeUser('owner');
      const override = makeRoleOverride('owner', { 'settings.edit': false });
      expect(hasPermission(user, 'settings.edit', override)).toBe(true);
    });
  });

  describe('unknown role', () => {
    it('returns false for unknown role', () => {
      const user = makeUser('unknown_role');
      expect(hasPermission(user, 'menu.view')).toBe(false);
    });
  });
});

describe('getEffectivePermissions', () => {
  it('returns full map for owner', () => {
    const user = makeUser('owner');
    const perms = getEffectivePermissions(user);
    expect(Object.values(perms).every(Boolean)).toBe(true);
  });

  it('merges role overrides into defaults', () => {
    const user = makeUser('waiter');
    const override = makeRoleOverride('waiter', { 'orders.manage': true });
    const perms = getEffectivePermissions(user, override);
    expect(perms['orders.manage']).toBe(true);
    expect(perms['menu.view']).toBe(true);
  });

  it('individual overrides take final precedence', () => {
    const user = makeUser('waiter', { 'orders.manage': false });
    const override = makeRoleOverride('waiter', { 'orders.manage': true });
    const perms = getEffectivePermissions(user, override);
    expect(perms['orders.manage']).toBe(false);
  });
});
