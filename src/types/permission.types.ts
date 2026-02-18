export const PERMISSION_CODES = [
  'menu.view',
  'menu.edit',
  'orders.view',
  'orders.manage',
  'reports.view',
  'pos.use',
  'inventory.view',
  'inventory.edit',
  'team.view',
  'team.manage',
  'settings.view',
  'settings.edit',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type PermissionMap = Partial<Record<PermissionCode, boolean>>;

export interface RolePermissions {
  id: string;
  tenant_id: string;
  role: string;
  permissions: PermissionMap;
  updated_at: string;
  updated_by: string | null;
}

export const DEFAULT_PERMISSIONS: Record<string, Record<PermissionCode, boolean>> = {
  owner: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': true,
    'settings.view': true,
    'settings.edit': true,
  },
  admin: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': true,
    'settings.view': true,
    'settings.edit': true,
  },
  manager: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  cashier: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': false,
    'pos.use': true,
    'inventory.view': false,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  chef: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': false,
    'pos.use': false,
    'inventory.view': true,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  waiter: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': false,
    'reports.view': false,
    'pos.use': false,
    'inventory.view': false,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
};
