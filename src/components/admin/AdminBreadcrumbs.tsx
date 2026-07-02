'use client';

import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

/**
 * Map of URL segments to sidebar i18n keys.
 * Uses the same keys as navigation-config.ts labelKey values.
 */
const SEGMENT_LABEL_MAP: Record<string, string> = {
  orders: 'navOrders',
  menus: 'navMenus',
  categories: 'navCategories',
  items: 'navDishes',
  inventory: 'navInventory',
  recipes: 'navRecipes',
  suppliers: 'navSuppliers',
  announcements: 'navAnnouncements',
  coupons: 'navCoupons',
  suggestions: 'navSuggestions',
  pos: 'navPos',
  kitchen: 'navKitchen',
  service: 'navService',
  reports: 'navReports',
  'stock-history': 'navStockHistory',
  'qr-codes': 'navQrCodes',
  ads: 'navAds',
  settings: 'navSettings',
  users: 'navUsers',
  subscription: 'navSubscription',
  permissions: 'navPermissions',
  tables: 'navTables',
};

/** decodeURIComponent throws URIError on malformed input (e.g. "%E0"); fall back to the raw segment. */
function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const params = useParams();
  const t = useTranslations('sidebar');
  const site = params?.site as string | undefined;

  if (!site) return null;

  const basePath = `/sites/${site}/admin`;

  // Strip the base path to get relative segments. Anchored guard: if the
  // pathname does not start with the rewritten base (e.g. middleware behavior
  // change), render nothing rather than bogus crumbs from a no-op replace.
  if (!pathname.startsWith(basePath)) return null;
  const relativePath = pathname.slice(basePath.length);
  const segments = relativePath.split('/').filter(Boolean);

  // Ancestor segments only - the current page is shown by the page <h1> (AdminPageHeader).
  // Standard breadcrumb pattern: show the path TO the page, not the page itself.
  // Hide entirely on the dashboard and on depth-1 pages: with no ancestor beyond
  // the dashboard root, a lone Home icon carries no navigation value.
  if (segments.length < 2) return null;

  const ancestorSegments = segments.slice(0, -1);

  const crumbs = ancestorSegments.map((segment, index) => {
    const href = `${basePath}/${ancestorSegments.slice(0, index + 1).join('/')}`;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
    const labelKey = SEGMENT_LABEL_MAP[segment];
    const label = labelKey
      ? t(labelKey)
      : isUuid
        ? `#${segment.slice(0, 8).toUpperCase()}`
        : safeDecodeSegment(segment);

    return { href, label };
  });

  return (
    <Breadcrumb className="overflow-hidden">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={basePath}>
              <Home className="h-4 w-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={crumb.href}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
