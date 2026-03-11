'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChevronUp,
  Settings,
  ChevronsUpDown,
  Check,
  ArrowLeft,
  LayoutGrid,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { isAdminHome, getTenantUrl } from '@/lib/constants';
import { NAV_GROUPS } from '@/lib/layout/navigation-config';
import type { NavGroupConfig, NavItemConfig } from '@/lib/layout/navigation-config';

// ─── Types ──────────────────────────────────────────────

interface TenantSwitchOption {
  id: string;
  name: string;
  slug: string;
}

interface AdminSidebarProps {
  basePath: string;
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
    subscription_plan?: string;
  };
  userName?: string;
  userTenants?: TenantSwitchOption[];
  className?: string;
  /** Controlled collapsed state (lifted to layout for persistence) */
  collapsed?: boolean;
  /** Callback when user toggles collapsed state */
  onToggleCollapsed?: () => void;
}

// ─── Helpers ────────────────────────────────────────────

/** IDs of groups that render at the bottom of the sidebar */
const BOTTOM_GROUP_IDS = new Set(['pos', 'kitchen', 'service']);

/** ID of the analyse group — rendered inside account popover */
const ANALYSE_GROUP_ID = 'analyse';

/** Item paths that move from organization into the account popover */
const POPOVER_ITEM_PATHS = new Set(['/inventory', '/recipes', '/suppliers']);

/** Settings link rendered inside account popover */
const SETTINGS_ITEM = {
  path: '/settings',
  icon: Settings,
  labelKey: 'navSettings',
} satisfies Pick<NavItemConfig, 'path' | 'icon' | 'labelKey'>;

function isPathActive(pathname: string, basePath: string, itemPath: string): boolean {
  const fullPath = `${basePath}${itemPath}`;
  if (itemPath === '') {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
}

// ─── Component ──────────────────────────────────────────

export function AdminSidebar({
  basePath,
  tenant,
  userName,
  userTenants = [],
  className,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggleCollapsed = onToggleCollapsed ?? (() => setInternalCollapsed((prev) => !prev));
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  // Split groups: all nav in one list (bottom shortcuts after dashboard), analyse goes into popover
  // Also filter out popover items from organization group
  const nonAnalyseGroups = NAV_GROUPS.filter((g) => g.id !== ANALYSE_GROUP_ID).map((g) => {
    if (g.id === 'organization') {
      return { ...g, items: g.items.filter((item) => !POPOVER_ITEM_PATHS.has(item.path)) };
    }
    return g;
  });

  // Reorder: dashboard first, then POS/Kitchen/Service, then the rest
  const dashboardGroup = nonAnalyseGroups.filter((g) => g.id === 'dashboard');
  const bottomGroups = nonAnalyseGroups.filter((g) => BOTTOM_GROUP_IDS.has(g.id));
  const restGroups = nonAnalyseGroups.filter(
    (g) => g.id !== 'dashboard' && !BOTTOM_GROUP_IDS.has(g.id),
  );
  const mainGroups = [...dashboardGroup, ...bottomGroups, ...restGroups];

  const analyseGroup = NAV_GROUPS.find((g) => g.id === ANALYSE_GROUP_ID);

  // Items moved from organization to popover
  const organizationGroup = NAV_GROUPS.find((g) => g.id === 'organization');
  const popoverOrgItems = organizationGroup
    ? organizationGroup.items.filter((item) => POPOVER_ITEM_PATHS.has(item.path))
    : [];

  // Client-facing URL for QR code (subdomain format)
  const clientUrl = getTenantUrl(tenant.slug);

  // Plan display label
  const planLabel = tenant.subscription_plan
    ? `Plan ${tenant.subscription_plan.charAt(0).toUpperCase()}${tenant.subscription_plan.slice(1)}`
    : 'Plan Gratuit';

  // Switch to another tenant
  const switchTenant = (slug: string) => {
    router.push(`/sites/${slug}/admin`);
  };

  return (
    <aside
      className={cn(
        'shrink-0 bg-app-card flex-col transition-all duration-200 overflow-hidden',
        collapsed ? 'w-16' : 'w-56',
        className,
      )}
    >
      {/* ── Tenant switcher header + collapse toggle ── */}
      <div className="shrink-0 border-b border-app-border">
        <div
          className={cn(
            'flex items-center py-3',
            collapsed ? 'px-2 justify-center' : 'pl-3 pr-1 gap-2',
          )}
        >
          {/* Back arrow / spaces grid */}
          <Link
            href={isAdminHome(pathname, basePath) ? '/admin/tenants' : basePath}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-app-hover transition-colors shrink-0"
            title={isAdminHome(pathname, basePath) ? 'Mes espaces' : 'Retour'}
          >
            {isAdminHome(pathname, basePath) ? (
              <LayoutGrid className="w-4 h-4 text-app-text-muted" />
            ) : (
              <ArrowLeft className="w-4 h-4 text-app-text-muted" />
            )}
          </Link>

          {/* Tenant switcher popover */}
          {!collapsed && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  suppressHydrationWarning
                  className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1 rounded-lg hover:bg-app-hover transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-app-text truncate">{tenant.name}</p>
                    <p className="text-[10px] text-app-text-muted truncate">
                      {tenant.slug}.attabl.com
                    </p>
                  </div>
                  <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-app-text-muted" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={4}
                className="w-[calc(var(--radix-popover-trigger-width)-16px)] p-0 bg-app-card border-app-border rounded-xl shadow-lg"
              >
                <div className="p-1.5">
                  {userTenants.length > 0 ? (
                    userTenants.map((t) => {
                      const isCurrent = t.slug === tenant.slug;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (!isCurrent) switchTenant(t.slug);
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                            isCurrent
                              ? 'bg-accent-muted text-accent'
                              : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                          )}
                        >
                          <div className="w-7 h-7 rounded-lg bg-app-elevated flex items-center justify-center font-bold text-[10px] shrink-0">
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{t.name}</p>
                            <p className="text-[10px] text-app-text-muted truncate">
                              {t.slug}.attabl.com
                            </p>
                          </div>
                          {isCurrent && <Check className="w-4 h-4 shrink-0" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2.5 text-sm text-app-text-muted">{tenant.name}</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Collapse toggle — directly under tenant info */}
        <div className={cn('pb-2', collapsed ? 'px-2' : 'px-3')}>
          <button
            type="button"
            onClick={handleToggleCollapsed}
            className={cn(
              'w-full flex items-center gap-3 py-1.5 rounded-lg text-app-text-muted opacity-40 hover:opacity-100 hover:bg-app-hover transition-colors overflow-hidden',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
            title={collapsed ? t('expand') : t('collapse')}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0" />
            ) : (
              <PanelLeftClose className="w-4 h-4 shrink-0" />
            )}
            {!collapsed && <span className="text-xs whitespace-nowrap">{t('collapse')}</span>}
          </button>
        </div>
      </div>

      {/* ── Scrollable navigation ── */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {mainGroups.map((group, index) => (
          <SidebarGroup
            key={group.id}
            group={group}
            basePath={basePath}
            pathname={pathname}
            collapsed={collapsed}
            t={t}
            showSeparator={index > 0 && group.items.length > 0}
          />
        ))}
      </nav>

      {/* ── Bottom card: QR + user + popover ── */}
      <div className="shrink-0">
        <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
          {!collapsed ? (
            <div className="px-3 pb-3 pt-2">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  suppressHydrationWarning
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-app-border bg-app-elevated/50 hover:bg-app-hover transition-colors text-left"
                >
                  {/* Scannable QR code */}
                  <div className="w-11 h-11 rounded-lg bg-white shrink-0 flex items-center justify-center p-1">
                    <QRCodeSVG
                      value={clientUrl}
                      size={36}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="M"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-app-text truncate">
                      {userName || 'Utilisateur'}
                    </p>
                    <span className="text-[9px] font-semibold text-accent">{planLabel}</span>
                  </div>
                  <ChevronUp className="w-3.5 h-3.5 text-app-text-muted shrink-0" />
                </button>
              </PopoverTrigger>
              <div className="hidden qr-download-source">
                <QRCodeSVG
                  value={clientUrl}
                  size={512}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                />
              </div>
            </div>
          ) : (
            <PopoverTrigger asChild>
              <button
                type="button"
                suppressHydrationWarning
                className="w-full py-3 flex justify-center hover:bg-app-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-accent" />
                </div>
              </button>
            </PopoverTrigger>
          )}
          <PopoverContent
            side={collapsed ? 'right' : 'top'}
            align={collapsed ? 'end' : 'center'}
            sideOffset={8}
            className={cn(
              'p-0 bg-app-card border-app-border rounded-xl shadow-lg',
              collapsed ? 'w-56' : 'w-[calc(var(--radix-popover-trigger-width)-16px)]',
            )}
          >
            {/* Settings link */}
            <div className="p-1.5">
              <Link
                href={`${basePath}${SETTINGS_ITEM.path}`}
                onClick={() => setAccountPopoverOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isPathActive(pathname, basePath, SETTINGS_ITEM.path)
                    ? 'text-accent bg-accent-muted'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                )}
              >
                <SETTINGS_ITEM.icon className="w-4 h-4 shrink-0" />
                <span>{t(SETTINGS_ITEM.labelKey)}</span>
              </Link>
            </div>

            {/* Organization items moved to popover (Inventaire, Fiches techniques, Fournisseurs) */}
            {popoverOrgItems.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-app-text-muted">
                    {t('groupOrganization')}
                  </p>
                </div>
                <div className="p-1.5 pt-0">
                  {popoverOrgItems.map((item) => {
                    const href = `${basePath}${item.path}`;
                    const active = isPathActive(pathname, basePath, item.path);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.path}
                        href={href}
                        onClick={() => setAccountPopoverOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          active
                            ? 'text-accent bg-accent-muted'
                            : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* Analyse items */}
            {analyseGroup && analyseGroup.items.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-app-text-muted">
                    {t(analyseGroup.titleKey)}
                  </p>
                </div>
                <div className="p-1.5 pt-0">
                  {analyseGroup.items.map((item) => {
                    const href = `${basePath}${item.path}`;
                    const active = isPathActive(pathname, basePath, item.path);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.path}
                        href={href}
                        onClick={() => setAccountPopoverOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          active
                            ? 'text-accent bg-accent-muted'
                            : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* Logout */}
            <div className="p-1.5 border-t border-app-border">
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-status-error hover:bg-status-error-bg transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{t('logout')}</span>
                </button>
              </form>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}

// ─── Sidebar Group ──────────────────────────────────────

interface SidebarGroupProps {
  group: NavGroupConfig;
  basePath: string;
  pathname: string;
  collapsed: boolean;
  t: ReturnType<typeof useTranslations>;
  showSeparator?: boolean;
}

function SidebarGroup({
  group,
  basePath,
  pathname,
  collapsed,
  t,
  showSeparator,
}: SidebarGroupProps) {
  // Direct link groups (no sub-items) — render as a single link
  if (group.directPath !== undefined && group.items.length === 0) {
    const href = `${basePath}${group.directPath}`;
    const active = isPathActive(pathname, basePath, group.directPath);
    const Icon = group.icon;

    return (
      <Link
        href={href}
        className={cn(
          'flex items-center py-1.5 rounded-lg text-sm transition-colors',
          active
            ? 'text-accent bg-accent-muted'
            : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        )}
        title={collapsed ? t(group.titleKey) : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="truncate">{t(group.titleKey)}</span>}
      </Link>
    );
  }

  // When sidebar is collapsed, just show icons
  if (collapsed) {
    return (
      <>
        {showSeparator && <hr className="border-app-border my-2" />}
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const href = `${basePath}${item.path}`;
            const active = isPathActive(pathname, basePath, item.path);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={href}
                className={cn(
                  'flex items-center justify-center py-1.5 rounded-lg text-sm transition-colors',
                  active
                    ? 'text-accent bg-accent-muted'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                )}
                title={t(item.labelKey)}
              >
                <Icon className="w-4 h-4 shrink-0" />
              </Link>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div>
      {/* Separator line instead of group title */}
      {showSeparator && <hr className="border-app-border my-2" />}

      <div className="space-y-0.5">
        {group.items.map((item) => {
          const href = `${basePath}${item.path}`;
          const active = isPathActive(pathname, basePath, item.path);
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                active
                  ? 'text-accent bg-accent-muted'
                  : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
