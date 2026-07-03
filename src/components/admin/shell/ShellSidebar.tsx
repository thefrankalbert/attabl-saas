'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  Settings,
  Plus,
  ChevronsUpDown,
  CircleUser,
  LifeBuoy,
  LogOut,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getHiddenNav } from '@/lib/segment-features';
import { permissionForAdminSubPath } from '@/lib/auth/admin-route-permissions';
import { getSegmentFamily } from '@/lib/segment-terms';
import type { SettingsTab } from './SettingsDialog';
import type { TenantSwitchOption } from '@/types/tenant-switch.types';

// ─── Types ──────────────────────────────────────────────

interface ShellSidebarProps {
  basePath: string;
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
    subscription_plan?: string;
    establishment_type?: string;
  };
  userName?: string;
  userEmail?: string;
  userTenants?: TenantSwitchOption[];
  collapsed?: boolean;
  className?: string;
  /** Opens the settings hub dialog on the given tab (Parametres + account menu) */
  onOpenSettings?: (tab: SettingsTab) => void;
  /**
   * Effective permissions (3-level resolved server-side). Nav items whose route
   * requires a permission the member lacks are hidden. Absent = show everything
   * (fail-open on the UI only; the middleware + actions still enforce access).
   */
  navPermissions?: Record<string, boolean>;
}

type ShellNavItem = {
  /** Relative path appended to basePath ('' = dashboard home) */
  path: string;
  /** NAV_GROUPS id used for segment group-level hiding */
  groupId: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
};

// ─── Nav structure (mirrors the maquette sections) ──────

const MAIN: ShellNavItem[] = [
  { path: '', groupId: 'dashboard', icon: LayoutDashboard, labelKey: 'navDashboard' },
  { path: '/orders', groupId: 'orders', icon: ReceiptText, labelKey: 'navOrders' },
  { path: '/pos', groupId: 'pos', icon: CreditCard, labelKey: 'navPos' },
  { path: '/kitchen', groupId: 'kitchen', icon: ChefHat, labelKey: 'navKitchen' },
  { path: '/service', groupId: 'service', icon: HandPlatter, labelKey: 'navService' },
];

const CATALOGUE: ShellNavItem[] = [
  { path: '/menus', groupId: 'organization', icon: BookOpen, labelKey: 'navMenus' },
  { path: '/categories', groupId: 'organization', icon: LayoutGrid, labelKey: 'navCategories' },
  { path: '/items', groupId: 'organization', icon: UtensilsCrossed, labelKey: 'navDishes' },
];

const GESTION: ShellNavItem[] = [
  { path: '/inventory', groupId: 'organization', icon: Boxes, labelKey: 'navInventory' },
  { path: '/stock-history', groupId: 'analyse', icon: Package, labelKey: 'navStockHistory' },
  { path: '/suppliers', groupId: 'organization', icon: Truck, labelKey: 'navSuppliers' },
  { path: '/recipes', groupId: 'organization', icon: FileText, labelKey: 'navRecipes' },
];

const ANALYSE: ShellNavItem[] = [
  { path: '/reports', groupId: 'analyse', icon: ChartColumn, labelKey: 'navReports' },
];

function isPathActive(pathname: string, basePath: string, itemPath: string): boolean {
  const fullPath = `${basePath}${itemPath}`;
  if (itemPath === '') {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
}

// ─── Component ──────────────────────────────────────────

export function ShellSidebar({
  basePath,
  tenant,
  userName,
  userEmail,
  userTenants = [],
  collapsed = false,
  className,
  onOpenSettings,
  navPermissions,
}: ShellSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const tSeg = useTranslations('segment');

  // Segment-aware label overrides
  const family = getSegmentFamily(tenant.establishment_type);
  const segmentLabelOverrides: Record<string, string> = {
    navDishes: tSeg(`${family}.items`),
    navKitchen: tSeg(`${family}.productionKds`),
    navRecipes: tSeg(`${family}.recipes`),
  };
  const label = (key: string) => segmentLabelOverrides[key] ?? t(key);

  // Segment-based visibility
  const { groupIds: hiddenGroupIds, itemPaths: hiddenItemPaths } = getHiddenNav(
    tenant.establishment_type,
  );
  // Permission-based visibility: hide a link if its route needs a permission
  // the member lacks (per effective 3-level resolution passed from the server).
  // Fail-open when navPermissions is absent so a data gap never blanks the nav.
  const lacksPermission = (item: ShellNavItem) => {
    if (!navPermissions) return false;
    const required = permissionForAdminSubPath(item.path);
    return required != null && navPermissions[required] === false;
  };

  const isHidden = (item: ShellNavItem) =>
    hiddenGroupIds.has(item.groupId) || hiddenItemPaths.has(item.path) || lacksPermission(item);

  const visible = (items: ShellNavItem[]) => items.filter((i) => !isHidden(i));

  const main = visible(MAIN);
  const catalogue = visible(CATALOGUE);
  const gestion = visible(GESTION);
  const analyse = visible(ANALYSE);

  const initials =
    (userName || tenant.name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'AB';

  const planRaw = tenant.subscription_plan?.toUpperCase() || 'GRATUIT';

  const renderItem = (item: ShellNavItem) => {
    const Icon = item.icon;
    const active = isPathActive(pathname, basePath, item.path);
    const text = label(item.labelKey);
    return (
      <Link
        key={item.path || 'home'}
        href={`${basePath}${item.path}`}
        // Every admin route is force-dynamic and runs an auth + permission
        // resolution server-side. Default prefetch eagerly renders all ~15
        // sidebar targets in the background (a burst of getUser + admin_users +
        // role_permissions round-trips) which saturates slow connections and
        // can time out the page the user actually clicked. Load on click.
        prefetch={false}
        title={collapsed ? text : undefined}
        className={cn(
          'flex items-center gap-2 h-8 rounded-[0.625rem] text-[13px] transition-colors',
          collapsed ? 'justify-center px-0' : 'px-2',
          active
            ? 'bg-[var(--sidebar-accent)] font-medium text-[var(--sidebar-foreground)]'
            : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            active ? 'text-[var(--sidebar-foreground)]' : 'text-[var(--muted-foreground)]',
          )}
          strokeWidth={2}
        />
        {!collapsed && <span className="truncate">{text}</span>}
      </Link>
    );
  };

  const renderGroup = (labelKey: string | null, items: ShellNavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col py-2">
        {labelKey && !collapsed && (
          <div className="flex h-8 items-center px-2 text-xs font-medium text-[var(--muted-foreground)]">
            {t(labelKey)}
          </div>
        )}
        <div className="flex flex-col gap-0.5">{items.map(renderItem)}</div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col p-2 text-[var(--sidebar-foreground)] transition-[width] duration-200',
        'h-full sticky top-0',
        collapsed ? 'w-[72px]' : 'w-64',
        className,
      )}
    >
      <div className="flex h-full flex-col gap-1">
        {/* ── Brand / team switcher ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              title={collapsed ? 'ATTABL' : undefined}
              className={cn(
                'flex h-12 w-full items-center gap-2 rounded-[0.625rem] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
                collapsed ? 'justify-center px-0' : 'justify-start px-2',
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[0.625rem] bg-[var(--primary)] text-[var(--primary-foreground)]">
                <UtensilsCrossed className="size-4" />
              </span>
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                    <span className="truncate text-[13px] font-semibold">ATTABL</span>
                    <span className="truncate text-xs text-[var(--muted-foreground)]">
                      {tenant.name}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-56">
            <DropdownMenuLabel className="text-[var(--muted-foreground)]">
              {t('switchSpace')}
            </DropdownMenuLabel>
            {userTenants.length > 0 ? (
              userTenants.map((opt) => {
                const isCurrent = opt.slug === tenant.slug;
                return (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => {
                      if (!isCurrent) router.push(`/sites/${opt.slug}/admin`);
                    }}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--secondary)] text-[10px] font-bold text-[var(--secondary-foreground)]">
                      {opt.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{opt.name}</span>
                    {isCurrent && <Check className="size-4 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem disabled>{tenant.name}</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-[44px]"
              onClick={() => router.push('/admin/tenants')}
            >
              <Plus className="size-4 shrink-0" />
              <span className="flex-1 truncate">{t('addRestaurant')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── Scrollable nav ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Main group: quick action + primary nav */}
          <div className="flex flex-col py-2">
            <Link
              href={`${basePath}/pos`}
              prefetch={false}
              title={collapsed ? t('newOrder') : undefined}
              className={cn(
                'mb-1 flex h-8 items-center gap-2 rounded-[0.625rem] bg-[var(--primary)] text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90',
                collapsed ? 'justify-center px-0' : 'px-2.5',
              )}
            >
              <Plus className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{t('newOrder')}</span>}
            </Link>
            <div className="flex flex-col gap-0.5">{main.map(renderItem)}</div>
          </div>

          {renderGroup('secCatalogue', catalogue)}
          {renderGroup('secGestion', gestion)}
          {renderGroup('groupAnalyse', analyse)}
        </div>

        {/* ── Footer: user dropdown ── */}
        <div className="mt-auto border-t border-[var(--sidebar-border)] pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                title={collapsed ? userName || t('accountMenu') : undefined}
                className={cn(
                  'flex h-12 w-full items-center gap-2 rounded-[0.625rem] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
                  collapsed ? 'justify-center px-0' : 'justify-start px-2',
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-[var(--secondary)] text-xs font-semibold text-[var(--secondary-foreground)]">
                  {initials}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                      <span className="truncate text-[13px] font-semibold">
                        {userName || t('accountMenu')}
                      </span>
                      <span className="truncate text-xs text-[var(--muted-foreground)]">
                        {userEmail || `${tenant.slug}.attabl.com`}
                      </span>
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? 'right' : 'top'}
              align={collapsed ? 'end' : 'start'}
              className="w-56"
            >
              <DropdownMenuLabel>
                <span className="flex flex-col">
                  <span className="truncate text-[13px] font-semibold">
                    {userName || t('accountMenu')}
                  </span>
                  <span className="truncate text-xs font-normal text-[var(--muted-foreground)]">
                    {userEmail || `${tenant.slug}.attabl.com`}
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onOpenSettings ? (
                <>
                  <DropdownMenuItem onClick={() => onOpenSettings('compte')}>
                    <CircleUser className="size-4" />
                    {t('accountMenu')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenSettings('etablissement')}>
                    <Settings className="size-4" />
                    {t('navSettings')}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`${basePath}/settings`} prefetch={false}>
                      <CircleUser className="size-4" />
                      {t('accountMenu')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`${basePath}/settings`} prefetch={false}>
                      <Settings className="size-4" />
                      {t('navSettings')}
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/subscription`} prefetch={false}>
                  <CreditCard className="size-4" />
                  <span className="flex-1">{t('navSubscription')}</span>
                  <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--secondary-foreground)]">
                    {planRaw}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/support`} prefetch={false}>
                  <LifeBuoy className="size-4" />
                  {t('navSupport')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action="/api/auth/signout" method="post">
                <DropdownMenuItem asChild className="text-[var(--destructive)]">
                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 px-2.5 py-2 font-normal text-[var(--destructive)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]"
                  >
                    <LogOut className="size-4" />
                    {t('logout')}
                  </Button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
