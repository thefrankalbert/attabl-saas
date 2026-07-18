'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHiddenNav } from '@/lib/segment-features';
import { permissionForAdminSubPath } from '@/lib/auth/admin-route-permissions';
import { getSegmentFamily } from '@/lib/segment-terms';
import { UpdateAvailableBanner } from '@/components/admin/UpdateAvailableBanner';
import type { SettingsTab } from './SettingsDialog';
import type { TenantSwitchOption } from '@/types/tenant-switch.types';
import { MAIN, CATALOGUE, GESTION, ANALYSE, isPathActive, type ShellNavItem } from './shell-nav';
import { ShellBrandSwitcher } from './ShellBrandSwitcher';
import { ShellAccountMenu } from './ShellAccountMenu';
import { SidebarPlanCard } from './SidebarPlanCard';

// --- Types ----------------------------------------------

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
  /** Server-baked deploy sha, forwarded to the update-available row in the footer. */
  appVersion?: string;
}

// --- Component ------------------------------------------

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
  appVersion,
}: ShellSidebarProps) {
  const pathname = usePathname();
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
  const planName = tenant.subscription_plan
    ? tenant.subscription_plan.charAt(0).toUpperCase() +
      tenant.subscription_plan.slice(1).toLowerCase()
    : t('planFree');

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
        {/* -- Brand / team switcher -- */}
        <ShellBrandSwitcher
          tenantName={tenant.name}
          tenantSlug={tenant.slug}
          userTenants={userTenants}
          collapsed={collapsed}
        />

        {/* -- Scrollable nav -- */}
        {/* pr-1.5: gutter so the overlay scrollbar floats clear of the full-width
            CTA + nav rows instead of overlapping their right edge on short viewports */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1.5">
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

        {/* -- Footer: plan upsell + user dropdown -- */}
        <div className="mt-auto border-t border-[var(--sidebar-border)] pt-2">
          <SidebarPlanCard
            basePath={basePath}
            planName={planName}
            planRaw={planRaw}
            collapsed={collapsed}
          />
          <ShellAccountMenu
            basePath={basePath}
            tenantSlug={tenant.slug}
            userName={userName}
            userEmail={userEmail}
            initials={initials}
            planName={planName}
            planRaw={planRaw}
            collapsed={collapsed}
            onOpenSettings={onOpenSettings}
          />

          {/* New-version pill - discreet, just under the account block */}
          {appVersion && (
            <UpdateAvailableBanner currentVersion={appVersion} collapsed={collapsed} />
          )}
        </div>
      </div>
    </aside>
  );
}
