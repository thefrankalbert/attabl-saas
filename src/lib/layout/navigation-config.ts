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
  Printer,
  Laptop,
  ChefHat,
  UserCheck,
  BarChart3,
  History,
  TrendingDown,
  Receipt,
  ScrollText,
} from 'lucide-react';

// --- Types ----------------------------------------------

export type NavItemConfig = {
  /** Relative path appended to basePath (e.g. '/menus') */
  path: string;
  icon: typeof LayoutDashboard;
  /** i18n key in 'sidebar' namespace */
  labelKey: string;
  highlight?: boolean;
};

// Pas de permission ici: la permission d'un lien est celle de sa ROUTE
// (`permissionForAdminSubPath`), lue par la barre laterale, la barre du bas et
// la palette de commandes. Une seconde table ici divergeait de la route.

export type NavGroupConfig = {
  id: string;
  /** i18n key in 'sidebar' namespace */
  titleKey: string;
  icon: typeof LayoutDashboard;
  items: NavItemConfig[];
  /** If set, group is a direct link (no sub-items) */
  directPath?: string;
  highlight?: boolean;
  /** Section bucket used by the redesigned sidebar (mono uppercase header).
   * Groups with the same section label are grouped under that heading.
   * If omitted the group is rendered alone above the sections. */
  sectionKey?: 'operations' | 'catalog' | 'marketing';
};

// --- Navigation Configuration ---------------------------

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'dashboard',
    titleKey: 'navDashboard',
    icon: LayoutDashboard,
    directPath: '',
    items: [],
    sectionKey: 'operations',
  },
  {
    id: 'orders',
    titleKey: 'navOrders',
    icon: ShoppingBag,
    directPath: '/orders',
    items: [],
    sectionKey: 'operations',
  },
  {
    id: 'organization',
    titleKey: 'groupOrganization',
    icon: ClipboardList,
    sectionKey: 'catalog',
    items: [
      {
        path: '/menus',
        icon: ClipboardList,
        labelKey: 'navMenus',
      },
      {
        path: '/categories',
        icon: UtensilsCrossed,
        labelKey: 'navCategories',
      },
      {
        path: '/items',
        icon: BookOpen,
        labelKey: 'navDishes',
      },
      {
        path: '/inventory',
        icon: Package,
        labelKey: 'navInventory',
      },
      {
        path: '/inventory/counts',
        icon: ClipboardList,
        labelKey: 'navInventoryCounts',
      },
      {
        path: '/recipes',
        icon: BookOpenCheck,
        labelKey: 'navRecipes',
      },
      {
        path: '/suppliers',
        icon: Truck,
        labelKey: 'navSuppliers',
      },
    ],
  },
  {
    id: 'marketing',
    titleKey: 'groupMarketing',
    icon: Megaphone,
    sectionKey: 'marketing',
    items: [
      {
        path: '/announcements',
        icon: Megaphone,
        labelKey: 'navAnnouncements',
      },
      {
        path: '/coupons',
        icon: Tag,
        labelKey: 'navCoupons',
      },
      {
        path: '/suggestions',
        icon: Lightbulb,
        labelKey: 'navSuggestions',
      },
      {
        path: '/supports',
        icon: Printer,
        labelKey: 'navSupports',
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
    sectionKey: 'operations',
  },
  {
    id: 'kitchen',
    titleKey: 'navKitchen',
    icon: ChefHat,
    directPath: '/kitchen',
    highlight: true,
    items: [],
    sectionKey: 'operations',
  },
  {
    id: 'service',
    titleKey: 'navService',
    icon: UserCheck,
    directPath: '/service',
    items: [],
    sectionKey: 'operations',
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
      },
      {
        path: '/stock-history',
        icon: History,
        labelKey: 'navStockHistory',
      },
      {
        path: '/stock-losses',
        icon: TrendingDown,
        labelKey: 'navStockLosses',
      },
      {
        path: '/invoices',
        icon: Receipt,
        labelKey: 'navInvoices',
      },
      {
        path: '/audit-logs',
        icon: ScrollText,
        labelKey: 'navAuditLogs',
      },
    ],
  },
];

/**
 * Bottom nav items for mobile admin (5 items max).
 * Maps role to the most relevant nav items. Ce n'est qu'un ORDRE de preference:
 * AdminBottomNav retire ensuite chaque entree dont la route est refusee au
 * membre (permissions effectives).
 */
export const BOTTOM_NAV_ITEMS: Record<string, string[]> = {
  owner: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  admin: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  manager: ['dashboard', 'orders', 'pos', 'kitchen', 'analyse'],
  chef: ['dashboard', 'orders', 'kitchen', 'organization', 'analyse'],
  cashier: ['dashboard', 'orders', 'pos', 'organization', 'analyse'],
  waiter: ['dashboard', 'orders', 'pos', 'service', 'organization'],
};
