import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  UtensilsCrossed,
  BookOpen,
  Package,
  BookOpenCheck,
  Truck,
  Megaphone,
  Tag,
  Lightbulb,
  Laptop,
  ChefHat,
  UserCheck,
  BarChart3,
  History,
  Receipt,
  ScrollText,
} from 'lucide-react';
import type { NavItemPermission } from '@/lib/permissions';
import type { PermissionCode } from '@/types/permission.types';

// ─── Types ──────────────────────────────────────────────

export type NavItemConfig = {
  /** Relative path appended to basePath (e.g. '/menus') */
  path: string;
  icon: typeof LayoutDashboard;
  /** i18n key in 'sidebar' namespace */
  labelKey: string;
  highlight?: boolean;
  requiredPermission?: NavItemPermission;
  permissionCode?: PermissionCode;
  ownerOnly?: boolean;
};

export type NavGroupConfig = {
  id: string;
  /** i18n key in 'sidebar' namespace */
  titleKey: string;
  icon: typeof LayoutDashboard;
  items: NavItemConfig[];
  /** If set, group is a direct link (no sub-items) */
  directPath?: string;
  highlight?: boolean;
  requiredPermission?: NavItemPermission;
  permissionCode?: PermissionCode;
};

// ─── Navigation Configuration ───────────────────────────

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'dashboard',
    titleKey: 'navDashboard',
    icon: LayoutDashboard,
    directPath: '',
    items: [],
  },
  {
    id: 'orders',
    titleKey: 'navOrders',
    icon: ShoppingBag,
    directPath: '/orders',
    items: [],
    permissionCode: 'orders.view',
  },
  {
    id: 'organization',
    titleKey: 'groupOrganization',
    icon: ClipboardList,
    items: [
      {
        path: '/menus',
        icon: ClipboardList,
        labelKey: 'navMenus',
        requiredPermission: 'canManageMenus',
        permissionCode: 'menu.view',
      },
      {
        path: '/categories',
        icon: UtensilsCrossed,
        labelKey: 'navCategories',
        requiredPermission: 'canManageMenus',
        permissionCode: 'menu.view',
      },
      {
        path: '/items',
        icon: BookOpen,
        labelKey: 'navDishes',
        requiredPermission: 'canManageMenus',
        permissionCode: 'menu.view',
      },
      {
        path: '/inventory',
        icon: Package,
        labelKey: 'navInventory',
        requiredPermission: 'canViewStocks',
        permissionCode: 'inventory.view',
      },
      {
        path: '/recipes',
        icon: BookOpenCheck,
        labelKey: 'navRecipes',
        requiredPermission: 'canManageMenus',
        permissionCode: 'menu.view',
      },
      {
        path: '/suppliers',
        icon: Truck,
        labelKey: 'navSuppliers',
        requiredPermission: 'canManageStocks',
        permissionCode: 'inventory.edit',
      },
    ],
  },
  {
    id: 'marketing',
    titleKey: 'groupMarketing',
    icon: Megaphone,
    items: [
      {
        path: '/announcements',
        icon: Megaphone,
        labelKey: 'navAnnouncements',
        requiredPermission: 'canManageSettings',
        permissionCode: 'settings.edit',
      },
      {
        path: '/coupons',
        icon: Tag,
        labelKey: 'navCoupons',
        requiredPermission: 'canManageSettings',
        permissionCode: 'settings.edit',
      },
      {
        path: '/suggestions',
        icon: Lightbulb,
        labelKey: 'navSuggestions',
        requiredPermission: 'canManageMenus',
        permissionCode: 'menu.edit',
      },
    ],
  },
  {
    id: 'pos',
    titleKey: 'navPos',
    icon: Laptop,
    directPath: '/pos',
    highlight: true,
    items: [],
    requiredPermission: 'canConfigurePOS',
    permissionCode: 'pos.use',
  },
  {
    id: 'kitchen',
    titleKey: 'navKitchen',
    icon: ChefHat,
    directPath: '/kitchen',
    highlight: true,
    items: [],
    requiredPermission: 'canConfigureKitchen',
    permissionCode: 'orders.manage',
  },
  {
    id: 'service',
    titleKey: 'navService',
    icon: UserCheck,
    directPath: '/service',
    items: [],
    requiredPermission: 'canManageUsers',
    permissionCode: 'team.view',
  },
  {
    id: 'analyse',
    titleKey: 'groupAnalyse',
    icon: BarChart3,
    items: [
      {
        path: '/reports',
        icon: BarChart3,
        labelKey: 'navReports',
        requiredPermission: 'canViewAllStats',
        permissionCode: 'reports.view',
      },
      {
        path: '/stock-history',
        icon: History,
        labelKey: 'navStockHistory',
        requiredPermission: 'canViewStocks',
        permissionCode: 'inventory.view',
      },
      {
        path: '/invoices',
        icon: Receipt,
        labelKey: 'navInvoices',
        ownerOnly: true,
      },
      {
        path: '/audit-logs',
        icon: ScrollText,
        labelKey: 'navAuditLogs',
        ownerOnly: true,
      },
    ],
  },
];

/**
 * Bottom nav items for mobile admin (5 items max).
 * Maps role to the most relevant nav items.
 */
export const BOTTOM_NAV_ITEMS: Record<string, string[]> = {
  owner: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  admin: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  manager: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  chef: ['dashboard', 'orders', 'kitchen', 'organization', 'analyse'],
  cashier: ['dashboard', 'orders', 'pos', 'organization', 'analyse'],
  waiter: ['dashboard', 'orders', 'pos', 'service', 'organization'],
};
