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
  QrCode,
  ClipboardList,
  TrendingDown,
  Megaphone,
  Tag,
  Lightbulb,
  Printer,
  Image as ImageIcon,
} from 'lucide-react';

// --- Types ----------------------------------------------

export type ShellNavItem = {
  /** Relative path appended to basePath ('' = dashboard home) */
  path: string;
  /** NAV_GROUPS id used for segment group-level hiding */
  groupId: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  /**
   * Pages rattachees: le lien reste actif sur elles. Les pages d'analyse ont
   * leurs onglets sous "Rapports" (AnalyseTabs): un lien chacune dans la barre
   * ferait doublon, mais "Rapports" doit rester allume dessus.
   */
  alsoActiveOn?: readonly string[];
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
  { path: '/qr-codes', groupId: 'organization', icon: QrCode, labelKey: 'navQrCodes' },
];

// Toutes les pages du restaurant ont leur lien: 11 n'etaient joignables que par
// une URL tapee a la main (audit d'equipe du 2026-11-27, DASH-16, DASH-18). La
// permission de chaque lien reste celle de sa route (permissionForAdminSubPath).
export const MARKETING: ShellNavItem[] = [
  { path: '/announcements', groupId: 'marketing', icon: Megaphone, labelKey: 'navAnnouncements' },
  { path: '/coupons', groupId: 'marketing', icon: Tag, labelKey: 'navCoupons' },
  { path: '/suggestions', groupId: 'marketing', icon: Lightbulb, labelKey: 'navSuggestions' },
  { path: '/ads', groupId: 'marketing', icon: ImageIcon, labelKey: 'navAds' },
  { path: '/supports', groupId: 'marketing', icon: Printer, labelKey: 'navSupports' },
];

export const GESTION: ShellNavItem[] = [
  { path: '/inventory', groupId: 'organization', icon: Boxes, labelKey: 'navInventory' },
  {
    path: '/inventory/counts',
    groupId: 'organization',
    icon: ClipboardList,
    labelKey: 'navInventoryCounts',
  },
  // Lien propre: le chef (inventory.view sans reports.view) n'a pas "Rapports"
  // et n'atteignait les pertes qu'en tapant l'URL.
  { path: '/stock-losses', groupId: 'analyse', icon: TrendingDown, labelKey: 'navStockLosses' },
  { path: '/stock-history', groupId: 'analyse', icon: Package, labelKey: 'navStockHistory' },
  { path: '/suppliers', groupId: 'organization', icon: Truck, labelKey: 'navSuppliers' },
  { path: '/recipes', groupId: 'organization', icon: FileText, labelKey: 'navRecipes' },
];

export const ANALYSE: ShellNavItem[] = [
  {
    path: '/reports',
    groupId: 'analyse',
    icon: ChartColumn,
    labelKey: 'navReports',
    alsoActiveOn: ['/invoices', '/audit-logs'],
  },
];

/**
 * Lien actif = le plus PRECIS qui correspond, alias `alsoActiveOn` compris: sur
 * /inventory/counts, "Inventaires physiques" et non "Inventaire"; sur
 * /reports/venues (onglet de Rapports), "Rapports".
 */
export function activeNavPath(
  pathname: string,
  basePath: string,
  items: readonly Pick<ShellNavItem, 'path' | 'alsoActiveOn'>[],
): string | null {
  let best: { path: string; length: number } | null = null;
  for (const item of items) {
    for (const candidate of [item.path, ...(item.alsoActiveOn ?? [])]) {
      if (!isPathActive(pathname, basePath, candidate)) continue;
      if (!best || candidate.length > best.length)
        best = { path: item.path, length: candidate.length };
    }
  }
  return best?.path ?? null;
}

export function isPathActive(pathname: string, basePath: string, itemPath: string): boolean {
  const fullPath = `${basePath}${itemPath}`;
  if (itemPath === '') {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
}
