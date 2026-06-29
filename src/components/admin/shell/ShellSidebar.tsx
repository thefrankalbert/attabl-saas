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
  /** Real counts shown as nav badges (maquette: Commandes/KDS/Plats) */
  counts?: Partial<Record<NavCountKey, number>>;
}

type NavCountKey = 'orders' | 'kitchen' | 'items';

type ShellNavItem = {
  /** Relative path appended to basePath ('' = dashboard home) */
  path: string;
  /** NAV_GROUPS id used for segment group-level hiding */
  groupId: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  /** Optional real-count badge key */
  countKey?: NavCountKey;
};

// ─── Nav structure (mirrors the maquette sections) ──────

const MAIN: ShellNavItem[] = [
  { path: '', groupId: 'dashboard', icon: LayoutDashboard, labelKey: 'navDashboard' },
  {
    path: '/orders',
    groupId: 'orders',
    icon: ReceiptText,
    labelKey: 'navOrders',
    countKey: 'orders',
  },
  { path: '/pos', groupId: 'pos', icon: CreditCard, labelKey: 'navPos' },
  {
    path: '/kitchen',
    groupId: 'kitchen',
    icon: ChefHat,
    labelKey: 'navKitchen',
    countKey: 'kitchen',
  },
  { path: '/service', groupId: 'service', icon: HandPlatter, labelKey: 'navService' },
];

const CATALOGUE: ShellNavItem[] = [
  { path: '/menus', groupId: 'organization', icon: BookOpen, labelKey: 'navMenus' },
  { path: '/categories', groupId: 'organization', icon: LayoutGrid, labelKey: 'navCategories' },
  {
    path: '/items',
    groupId: 'organization',
    icon: UtensilsCrossed,
    labelKey: 'navDishes',
    countKey: 'items',
  },
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

const FOOT: ShellNavItem[] = [
  { path: '/settings', groupId: 'settings', icon: Settings, labelKey: 'navSettings' },
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
  counts,
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
  const isHidden = (item: ShellNavItem) =>
    hiddenGroupIds.has(item.groupId) || hiddenItemPaths.has(item.path);

  const visible = (items: ShellNavItem[]) => items.filter((i) => !isHidden(i));

  const main = visible(MAIN);
  const catalogue = visible(CATALOGUE);
  const gestion = visible(GESTION);
  const analyse = visible(ANALYSE);
  const foot = visible(FOOT);

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
        {!collapsed && item.countKey && counts?.[item.countKey] != null && (
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            {counts[item.countKey]}
          </span>
        )}
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
          {onOpenSettings && foot.length > 0 ? (
            <div className="flex flex-col py-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenSettings('compte')}
                title={collapsed ? t('navSettings') : undefined}
                className={cn(
                  'h-8 justify-start gap-2 rounded-[0.625rem] px-2 text-[13px] font-normal text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Settings
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  strokeWidth={2}
                />
                {!collapsed && <span className="truncate">{t('navSettings')}</span>}
              </Button>
            </div>
          ) : (
            renderGroup(null, foot)
          )}
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
                <DropdownMenuItem onClick={() => onOpenSettings('compte')}>
                  <CircleUser className="size-4" />
                  {t('accountMenu')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href={`${basePath}/settings`}>
                    <CircleUser className="size-4" />
                    {t('accountMenu')}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/subscription`}>
                  <CreditCard className="size-4" />
                  <span className="flex-1">{t('navSubscription')}</span>
                  <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--secondary-foreground)]">
                    {planRaw}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/support`}>
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
