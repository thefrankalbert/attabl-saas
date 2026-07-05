import {
  LayoutDashboard,
  ReceiptText,
  CreditCard,
  ChefHat,
  HandPlatter,
  BookOpen,
  LayoutGrid,
  UtensilsCrossed,
  ChartColumn,
  Package,
  Boxes,
  Truck,
  FileText,
} from 'lucide-react';

// --- Types ----------------------------------------------

export type ShellNavItem = {
  /** Relative path appended to basePath ('' = dashboard home) */
  path: string;
  /** NAV_GROUPS id used for segment group-level hiding */
  groupId: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
};

// --- Nav structure (mirrors the maquette sections) ------

export const MAIN: ShellNavItem[] = [
  { path: '', groupId: 'dashboard', icon: LayoutDashboard, labelKey: 'navDashboard' },
  { path: '/orders', groupId: 'orders', icon: ReceiptText, labelKey: 'navOrders' },
  { path: '/pos', groupId: 'pos', icon: CreditCard, labelKey: 'navPos' },
  { path: '/kitchen', groupId: 'kitchen', icon: ChefHat, labelKey: 'navKitchen' },
  { path: '/service', groupId: 'service', icon: HandPlatter, labelKey: 'navService' },
];

export const CATALOGUE: ShellNavItem[] = [
  { path: '/menus', groupId: 'organization', icon: BookOpen, labelKey: 'navMenus' },
  { path: '/categories', groupId: 'organization', icon: LayoutGrid, labelKey: 'navCategories' },
  { path: '/items', groupId: 'organization', icon: UtensilsCrossed, labelKey: 'navDishes' },
];

export const GESTION: ShellNavItem[] = [
  { path: '/inventory', groupId: 'organization', icon: Boxes, labelKey: 'navInventory' },
  { path: '/stock-history', groupId: 'analyse', icon: Package, labelKey: 'navStockHistory' },
  { path: '/suppliers', groupId: 'organization', icon: Truck, labelKey: 'navSuppliers' },
  { path: '/recipes', groupId: 'organization', icon: FileText, labelKey: 'navRecipes' },
];

export const ANALYSE: ShellNavItem[] = [
  { path: '/reports', groupId: 'analyse', icon: ChartColumn, labelKey: 'navReports' },
];

export function isPathActive(pathname: string, basePath: string, itemPath: string): boolean {
  const fullPath = `${basePath}${itemPath}`;
  if (itemPath === '') {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
}
