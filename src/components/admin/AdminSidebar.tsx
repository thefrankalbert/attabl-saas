'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ChevronDown,
  ChevronUp,
  Settings,
  Check,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  CreditCard,
  LifeBuoy,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { getTenantUrl } from '@/lib/constants';
import { NAV_GROUPS } from '@/lib/layout/navigation-config';
import type { NavGroupConfig, NavItemConfig } from '@/lib/layout/navigation-config';
import { computeSidebarSections } from '@/lib/layout/nav-sections';
import { getHiddenNav } from '@/lib/segment-features';
import { getSegmentFamily } from '@/lib/segment-terms';
import { SidebarBrand } from './sidebar/SidebarBrand';
import { SidebarUsageCard } from './sidebar/SidebarUsageCard';

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
    establishment_type?: string;
  };
  userName?: string;
  userEmail?: string;
  /** Optional: current monthly orders usage (0..100) shown in the footer card */
  ordersUsagePercent?: number;
  userTenants?: TenantSwitchOption[];
  className?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

// ─── Helpers ────────────────────────────────────────────

const ANALYSE_GROUP_ID = 'analyse';
const POPOVER_ITEM_PATHS = new Set(['/inventory', '/recipes', '/suppliers']);

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
  userEmail,
  ordersUsagePercent,
  userTenants = [],
  className,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const tSeg = useTranslations('segment');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggleCollapsed = onToggleCollapsed ?? (() => setInternalCollapsed((prev) => !prev));
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

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

  // Trim organization items that belong to the account popover and drop hidden groups
  const visibleGroups = NAV_GROUPS.filter(
    (g) => g.id !== ANALYSE_GROUP_ID && !hiddenGroupIds.has(g.id),
  ).map((g) => {
    if (g.id === 'organization') {
      return {
        ...g,
        items: g.items.filter(
          (item) => !POPOVER_ITEM_PATHS.has(item.path) && !hiddenItemPaths.has(item.path),
        ),
      };
    }
    return g;
  });

  const sections = computeSidebarSections(visibleGroups);

  const analyseGroup = NAV_GROUPS.find((g) => g.id === ANALYSE_GROUP_ID);
  const organizationGroup = NAV_GROUPS.find((g) => g.id === 'organization');
  const popoverOrgItems = organizationGroup
    ? organizationGroup.items.filter((item) => POPOVER_ITEM_PATHS.has(item.path))
    : [];

  // Client-facing URL for QR code
  const clientUrl = getTenantUrl(tenant.slug);

  // Plan display label
  const planRaw = tenant.subscription_plan?.toUpperCase() || 'GRATUIT';
  const planLabel = `plan ${planRaw}`;

  const switchTenant = (slug: string) => {
    router.push(`/sites/${slug}/admin`);
  };

  // Footer usage data
  const usagePercent = Math.max(0, Math.min(100, ordersUsagePercent ?? 0));
  const usageSubtitle = userEmail ? `${userEmail} · ${planLabel}` : planLabel;

  return (
    <aside
      className={cn(
        'shrink-0 bg-app-bg border-r border-app-border flex-col transition-all duration-200 overflow-hidden',
        collapsed ? 'w-[68px]' : 'w-[224px]',
        className,
      )}
    >
      {/* ── Brand + org switcher + collapse toggle ── */}
      <div className="shrink-0 px-3 pt-4 pb-3 flex flex-col gap-3">
        <SidebarBrand
          name={tenant.name}
          slug={tenant.slug}
          logoUrl={tenant.logo_url}
          collapsed={collapsed}
        />

        {!collapsed && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                suppressHydrationWarning
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg border border-app-border bg-app-card hover:bg-app-elevated text-[13px] text-app-text-secondary text-left justify-start h-auto"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 admin-pulse"
                    aria-hidden
                  />
                  <span className="truncate">{t('switchSpace')}</span>
                </span>
                <ChevronDown className="w-3 h-3 shrink-0 text-app-text-muted" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={6}
              className="w-[calc(var(--radix-popover-trigger-width))] p-0 bg-app-card border-app-border rounded-lg shadow-lg"
            >
              <div className="p-1.5">
                {userTenants.length > 0 ? (
                  userTenants.map((opt) => {
                    const isCurrent = opt.slug === tenant.slug;
                    return (
                      <Button
                        key={opt.id}
                        variant="ghost"
                        onClick={() => {
                          if (!isCurrent) switchTenant(opt.slug);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-left justify-start h-auto',
                          isCurrent
                            ? 'bg-accent-muted text-accent'
                            : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                        )}
                      >
                        <div className="w-6 h-6 rounded-md bg-app-elevated grid place-items-center font-bold text-[10px] shrink-0">
                          {opt.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{opt.name}</p>
                          <p className="font-mono text-[10px] text-app-text-muted truncate">
                            {opt.slug}.attabl.com
                          </p>
                        </div>
                        {isCurrent && <Check className="w-4 h-4 shrink-0" />}
                      </Button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-[13px] text-app-text-muted">{tenant.name}</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* ── Scrollable sections ── */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto flex flex-col gap-5 pb-3',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {sections.map((section) => (
          <div key={section.key} className="flex flex-col gap-0.5">
            {!collapsed && (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-app-text-muted px-2.5 mb-1.5">
                {t(section.labelKey)}
              </p>
            )}
            {section.groups.map((group) => (
              <SidebarGroup
                key={group.id}
                group={group}
                basePath={basePath}
                pathname={pathname}
                collapsed={collapsed}
                label={label}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Footer: usage card + account popover + collapse toggle ── */}
      <div className="shrink-0 border-t border-app-border px-3 py-3 flex flex-col gap-2.5">
        {!collapsed && (
          <SidebarUsageCard
            label={t('usageMonthlyOrders')}
            percent={usagePercent}
            subtitle={usageSubtitle}
          />
        )}

        <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              suppressHydrationWarning
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg text-left justify-start h-auto hover:bg-app-elevated',
                collapsed ? 'justify-center p-1.5' : 'px-2 py-2',
              )}
            >
              <div
                className={cn(
                  'grid place-items-center rounded-md bg-accent-muted text-accent shrink-0',
                  collapsed ? 'w-8 h-8' : 'w-7 h-7',
                )}
              >
                <QrCode className="w-4 h-4" />
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-app-text truncate">
                      {userName || t('accountMenu')}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
                      {planLabel}
                    </p>
                  </div>
                  <ChevronUp className="w-3.5 h-3.5 shrink-0 text-app-text-muted" />
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side={collapsed ? 'right' : 'top'}
            align={collapsed ? 'end' : 'center'}
            sideOffset={8}
            className={cn(
              'p-0 bg-app-card border-app-border rounded-lg shadow-lg',
              collapsed ? 'w-56' : 'w-[calc(var(--radix-popover-trigger-width))]',
            )}
          >
            {/* QR code preview for downloading */}
            <div className="p-3 flex items-center gap-3 border-b border-app-border">
              <div className="w-12 h-12 rounded-md bg-white p-1 grid place-items-center shrink-0">
                <QRCodeSVG
                  value={clientUrl}
                  size={40}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-app-text truncate">
                  {userName || t('accountMenu')}
                </p>
                <p className="font-mono text-[10px] text-app-text-muted truncate">
                  {userEmail || `${tenant.slug}.attabl.com`}
                </p>
              </div>
            </div>
            <div className="hidden qr-download-source">
              <QRCodeSVG
                value={clientUrl}
                size={512}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
              />
            </div>

            <div className="p-1.5">
              <Link
                href={`${basePath}${SETTINGS_ITEM.path}`}
                onClick={() => setAccountPopoverOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                  isPathActive(pathname, basePath, SETTINGS_ITEM.path)
                    ? 'text-accent bg-accent-muted'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                )}
              >
                <SETTINGS_ITEM.icon className="w-4 h-4 shrink-0" />
                <span>{t(SETTINGS_ITEM.labelKey)}</span>
              </Link>
              <Link
                href={`${basePath}/subscription`}
                onClick={() => setAccountPopoverOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                  isPathActive(pathname, basePath, '/subscription')
                    ? 'text-accent bg-accent-muted'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                )}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>{t('navSubscription')}</span>
              </Link>
              <Link
                href={`${basePath}/support`}
                onClick={() => setAccountPopoverOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                  isPathActive(pathname, basePath, '/support')
                    ? 'text-accent bg-accent-muted'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                )}
              >
                <LifeBuoy className="w-4 h-4 shrink-0" />
                <span>{t('navSupport')}</span>
              </Link>
              <ThemeToggle label={t('navTheme')} />
            </div>

            {popoverOrgItems.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-app-text-muted">
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
                          'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                          active
                            ? 'text-accent bg-accent-muted'
                            : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{label(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {analyseGroup && (
              <div className="p-1.5 border-t border-app-border">
                <Link
                  href={`${basePath}/reports`}
                  onClick={() => setAccountPopoverOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors',
                    analyseGroup.items.some((item) => isPathActive(pathname, basePath, item.path))
                      ? 'text-accent bg-accent-muted'
                      : 'text-app-text-secondary hover:text-app-text hover:bg-app-elevated',
                  )}
                >
                  <analyseGroup.icon className="w-4 h-4 shrink-0" />
                  <span>{t('groupAnalyse')}</span>
                </Link>
              </div>
            )}

            <div className="p-1.5 border-t border-app-border">
              <form action="/api/auth/signout" method="post">
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-3 text-[13px] text-status-error hover:bg-status-error-bg"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{t('logout')}</span>
                </Button>
              </form>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          onClick={handleToggleCollapsed}
          className={cn(
            'w-full gap-2 py-1.5 text-app-text-muted opacity-60 hover:opacity-100 h-auto',
            collapsed ? 'justify-center px-0' : 'px-2 justify-start',
          )}
          title={collapsed ? t('expand') : t('collapse')}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0" />
          ) : (
            <PanelLeftClose className="w-4 h-4 shrink-0" />
          )}
          {!collapsed && <span className="text-[11px] whitespace-nowrap">{t('collapse')}</span>}
        </Button>
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
  label: (key: string) => string;
}

function SidebarGroup({ group, basePath, pathname, collapsed, label }: SidebarGroupProps) {
  // Direct-link group (dashboard, pos, kitchen, service, orders) → one entry
  if (group.directPath !== undefined && group.items.length === 0) {
    return (
      <SidebarLink
        href={`${basePath}${group.directPath}`}
        active={isPathActive(pathname, basePath, group.directPath)}
        icon={group.icon}
        labelText={label(group.titleKey)}
        collapsed={collapsed}
      />
    );
  }

  // Multi-item group (organization, marketing) → item list, no group title
  return (
    <>
      {group.items.map((item) => (
        <SidebarLink
          key={item.path}
          href={`${basePath}${item.path}`}
          active={isPathActive(pathname, basePath, item.path)}
          icon={item.icon}
          labelText={label(item.labelKey)}
          collapsed={collapsed}
        />
      ))}
    </>
  );
}

// ─── Sidebar Link ──────────────────────────────────────

interface SidebarLinkProps {
  href: string;
  active: boolean;
  icon: typeof Settings;
  labelText: string;
  collapsed: boolean;
}

function SidebarLink({ href, active, icon: Icon, labelText, collapsed }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      title={collapsed ? labelText : undefined}
      className={cn(
        'flex items-center rounded-md text-[13px] transition-colors gap-2.5',
        active
          ? 'bg-app-elevated text-app-text'
          : 'text-app-text-secondary hover:bg-app-card hover:text-app-text',
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5',
      )}
    >
      <Icon
        className={cn('shrink-0', 'w-[14px] h-[14px]', active ? 'opacity-100' : 'opacity-80')}
        strokeWidth={2}
      />
      {!collapsed && <span className="truncate">{labelText}</span>}
    </Link>
  );
}
