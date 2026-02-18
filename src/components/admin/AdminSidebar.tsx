'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  BookOpen,
  Settings,
  CreditCard,
  ChevronRight,
  ChevronDown,
  QrCode,
  LogOut,
  ChefHat,
  Megaphone,
  Tag,
  Laptop,
  ClipboardList,
  BarChart3,
  Users,
  Menu,
  X,
  Package,
  BookOpenCheck,
  Lightbulb,
  History,
  Truck,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getRolePermissions, type NavItemPermission } from '@/lib/permissions';
import type { AdminRole } from '@/types/admin.types';
import { useSidebar } from '@/contexts/SidebarContext';

// ─── Storage Keys ───────────────────────────────────────

const EXPANDED_GROUPS_KEY = 'attabl-sidebar-expanded';

// ─── Types ──────────────────────────────────────────────

interface AdminSidebarProps {
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
    primary_color?: string;
  };
  adminUser?: {
    name?: string;
    role: string;
  };
  role?: AdminRole;
  className?: string;
}

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  highlight?: boolean;
  requiredPermission?: NavItemPermission;
  ownerOnly?: boolean;
};

type NavGroup = {
  id: string;
  titleKey: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  directLink?: string;
  highlight?: boolean;
};

// ─── Component ──────────────────────────────────────────

export function AdminSidebar({ tenant, adminUser, role, className }: AdminSidebarProps) {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const { isCollapsed, toggleCollapsed } = useSidebar();

  const roleLabels: Record<string, string> = {
    owner: t('roleOwner'),
    admin: t('roleAdmin'),
    manager: t('roleManager'),
    chef: t('roleKitchen'),
    waiter: t('roleServer'),
    cashier: t('roleStaff'),
  };

  // Mobile sidebar: open only if toggled for current pathname
  const isOpen = openForPath === pathname;
  const toggleSidebar = () => setOpenForPath(isOpen ? null : pathname);

  const permissions = role ? getRolePermissions(role) : null;

  const basePath = `/sites/${tenant.slug}/admin`;

  // ─── Navigation Groups (new 7-group structure) ─────────

  const NAV_GROUPS: NavGroup[] = [
    {
      id: 'dashboard',
      titleKey: 'navDashboard',
      icon: LayoutDashboard,
      directLink: basePath,
      items: [],
    },
    {
      id: 'orders',
      titleKey: 'navOrders',
      icon: ShoppingBag,
      directLink: `${basePath}/orders`,
      items: [],
    },
    {
      id: 'organization',
      titleKey: 'groupOrganization',
      icon: ClipboardList,
      items: [
        {
          href: `${basePath}/menus`,
          icon: ClipboardList,
          label: t('navMenus'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `${basePath}/categories`,
          icon: UtensilsCrossed,
          label: t('navCategories'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `${basePath}/items`,
          icon: BookOpen,
          label: t('navDishes'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `${basePath}/inventory`,
          icon: Package,
          label: t('navInventory'),
          requiredPermission: 'canViewStocks',
        },
        {
          href: `${basePath}/recipes`,
          icon: BookOpenCheck,
          label: t('navRecipes'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `${basePath}/suppliers`,
          icon: Truck,
          label: t('navSuppliers'),
          requiredPermission: 'canManageStocks',
        },
      ],
    },
    {
      id: 'marketing',
      titleKey: 'groupMarketing',
      icon: Megaphone,
      items: [
        {
          href: `${basePath}/announcements`,
          icon: Megaphone,
          label: t('navAnnouncements'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `${basePath}/coupons`,
          icon: Tag,
          label: t('navCoupons'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `${basePath}/suggestions`,
          icon: Lightbulb,
          label: t('navSuggestions'),
          requiredPermission: 'canManageMenus',
        },
      ],
    },
    {
      id: 'pos',
      titleKey: 'navPos',
      icon: Laptop,
      directLink: `${basePath}/pos`,
      highlight: true,
      items: [],
      requiredPermission: 'canConfigurePOS',
    } as NavGroup & { requiredPermission?: NavItemPermission },
    {
      id: 'kitchen',
      titleKey: 'navKitchen',
      icon: ChefHat,
      directLink: `${basePath}/kitchen`,
      highlight: true,
      items: [],
      requiredPermission: 'canConfigureKitchen',
    } as NavGroup & { requiredPermission?: NavItemPermission },
    {
      id: 'settings',
      titleKey: 'groupSettings',
      icon: Settings,
      items: [
        {
          href: `${basePath}/settings`,
          icon: Settings,
          label: t('navGeneral'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `${basePath}/users`,
          icon: Users,
          label: t('navUsers'),
          requiredPermission: 'canManageUsers',
        },
        {
          href: `${basePath}/qr-codes`,
          icon: QrCode,
          label: t('navQrCodes'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `${basePath}/reports`,
          icon: BarChart3,
          label: t('navReports'),
          requiredPermission: 'canViewAllStats',
        },
        {
          href: `${basePath}/stock-history`,
          icon: History,
          label: t('navStockHistory'),
          requiredPermission: 'canViewStocks',
        },
        {
          href: `${basePath}/subscription`,
          icon: CreditCard,
          label: t('navSubscription'),
          ownerOnly: true,
        },
      ],
    },
  ];

  // ─── Filter by permissions ─────────────────────────────

  const filteredNavGroups = NAV_GROUPS.map((group) => {
    // Check group-level permission (for direct-link groups like POS/Kitchen)
    const groupPerm = (group as NavGroup & { requiredPermission?: NavItemPermission })
      .requiredPermission;
    if (groupPerm && permissions) {
      const val = permissions[groupPerm];
      const allowed = typeof val === 'boolean' ? val : !!val;
      if (!allowed) return null;
    }

    // Filter sub-items
    const filteredItems = group.items.filter((item) => {
      if (item.ownerOnly) return role === 'owner';
      if (!item.requiredPermission || !permissions) return true;
      const val = permissions[item.requiredPermission];
      return typeof val === 'boolean' ? val : !!val;
    });

    // If group has sub-items and all were filtered out, hide the group
    if (group.items.length > 0 && filteredItems.length === 0) return null;

    return { ...group, items: filteredItems };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  // ─── Expanded groups state ─────────────────────────────

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Load saved expanded state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_GROUPS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setExpandedGroups(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-expand parent group if a child is active
  useEffect(() => {
    for (const group of filteredNavGroups) {
      if (group.items.length > 0) {
        const hasActiveChild = group.items.some((item) => pathname === item.href);
        if (hasActiveChild && !expandedGroups[group.id]) {
          setExpandedGroups((prev) => {
            const next = { ...prev, [group.id]: true };
            try {
              localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
      }
    }
    // Only re-run when pathname changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // ─── Helper: check if a group or its children are active ─

  const isGroupActive = useCallback(
    (group: NavGroup): boolean => {
      if (group.directLink) {
        // For dashboard, exact match; for others, startsWith
        if (group.id === 'dashboard') return pathname === group.directLink;
        return pathname === group.directLink || pathname.startsWith(group.directLink + '/');
      }
      return group.items.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
      );
    },
    [pathname],
  );

  // ─── Tooltip for collapsed mode ────────────────────────

  const Tooltip = ({
    label,
    children,
    show,
  }: {
    label: string;
    children: React.ReactNode;
    show: boolean;
  }) => {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    if (!show) return <>{children}</>;

    return (
      <div
        ref={ref}
        className="relative"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
        {visible && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 px-2.5 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-md whitespace-nowrap pointer-events-none">
            {label}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden bg-white border border-neutral-200"
        onClick={toggleSidebar}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setOpenForPath(null)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 bg-white border-r border-neutral-100 z-40 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'border-b border-neutral-100 flex-shrink-0 flex items-center',
            isCollapsed ? 'p-3 justify-center' : 'p-6 justify-between',
          )}
        >
          <Link
            href={basePath}
            className={cn('flex items-center group', isCollapsed ? 'justify-center' : 'gap-3')}
          >
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className={cn('rounded-lg object-contain', isCollapsed ? 'w-8 h-8' : 'w-10 h-10')}
              />
            ) : (
              <div
                className={cn(
                  'rounded-lg flex items-center justify-center text-white font-bold',
                  isCollapsed ? 'w-8 h-8 text-xs' : 'w-10 h-10',
                )}
                style={{ backgroundColor: tenant.primary_color || '#374151' }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-neutral-900 truncate uppercase tracking-tight">
                  {tenant.name}
                </h2>
                <p className="text-xs text-neutral-500">
                  {adminUser ? roleLabels[adminUser.role] || adminUser.role : 'Admin'}
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            'flex-1 min-h-0 overflow-y-auto py-4',
            isCollapsed ? 'px-1.5 space-y-1' : 'px-3 space-y-1',
          )}
        >
          {filteredNavGroups.map((group) => {
            const active = isGroupActive(group);
            const isExpanded = expandedGroups[group.id] ?? false;
            const isDirectLink = !!group.directLink;

            // ─── Direct link item (Dashboard, Orders, POS, Kitchen) ─
            if (isDirectLink) {
              return (
                <Tooltip key={group.id} label={t(group.titleKey)} show={isCollapsed}>
                  <Link
                    href={group.directLink!}
                    className={cn(
                      'group flex items-center rounded-lg transition-all duration-200 relative',
                      isCollapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5 space-x-3',
                      active
                        ? 'bg-neutral-50 text-neutral-900 font-semibold'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 font-medium',
                      group.highlight && !active && 'bg-blue-50/50 border border-blue-100/50',
                    )}
                  >
                    {active && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                        style={{
                          backgroundColor: tenant.primary_color || '#000000',
                        }}
                      />
                    )}
                    <group.icon
                      className={cn(
                        'w-[18px] h-[18px] flex-shrink-0 transition-transform group-hover:scale-105',
                        active
                          ? ''
                          : group.highlight
                            ? 'text-blue-600'
                            : 'text-neutral-400 group-hover:text-neutral-600',
                      )}
                      style={active ? { color: tenant.primary_color || '#000000' } : undefined}
                    />
                    {!isCollapsed && (
                      <>
                        <span
                          className={cn(
                            'text-sm tracking-tight leading-none',
                            group.highlight && !active && 'text-blue-900 font-bold',
                          )}
                        >
                          {t(group.titleKey)}
                        </span>
                        {active && <ChevronRight className="h-4 w-4 ml-auto text-neutral-400" />}
                      </>
                    )}
                  </Link>
                </Tooltip>
              );
            }

            // ─── Collapsible group (Organization, Marketing, Settings) ─
            return (
              <div key={group.id}>
                <Tooltip key={group.id} label={t(group.titleKey)} show={isCollapsed}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isCollapsed) {
                        // In collapsed mode, expanding the sidebar first might be better,
                        // but the spec says just show tooltip. Let's expand the group
                        // and also un-collapse the sidebar so user can see children.
                        toggleCollapsed();
                        if (!isExpanded) toggleGroup(group.id);
                      } else {
                        toggleGroup(group.id);
                      }
                    }}
                    className={cn(
                      'w-full group flex items-center rounded-lg transition-all duration-200 relative',
                      isCollapsed ? 'px-2 py-2.5 justify-center' : 'px-3 py-2.5',
                      active && !isExpanded
                        ? 'bg-neutral-50 text-neutral-900 font-semibold'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 font-medium',
                    )}
                  >
                    {active && !isExpanded && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                        style={{
                          backgroundColor: tenant.primary_color || '#000000',
                        }}
                      />
                    )}
                    <group.icon
                      className={cn(
                        'w-[18px] h-[18px] flex-shrink-0 transition-transform group-hover:scale-105',
                        active ? '' : 'text-neutral-400 group-hover:text-neutral-600',
                      )}
                      style={active ? { color: tenant.primary_color || '#000000' } : undefined}
                    />
                    {!isCollapsed && (
                      <>
                        <span className="text-sm tracking-tight leading-none ml-3">
                          {t(group.titleKey)}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 ml-auto text-neutral-400 transition-transform duration-200',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </>
                    )}
                  </button>
                </Tooltip>

                {/* Collapsible sub-items */}
                {!isCollapsed && (
                  <div
                    className={cn(
                      'overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out',
                      isExpanded ? 'grid grid-rows-[1fr]' : 'grid grid-rows-[0fr]',
                    )}
                  >
                    <div className="min-h-0">
                      <div className="pl-4 mt-1 space-y-0.5">
                        {group.items.map((item) => {
                          const isItemActive =
                            pathname === item.href || pathname.startsWith(item.href + '/');

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={cn(
                                'group flex items-center px-3 py-2 rounded-lg transition-all duration-200 relative space-x-3',
                                isItemActive
                                  ? 'bg-neutral-50 text-neutral-900 font-semibold'
                                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 font-medium',
                              )}
                            >
                              {isItemActive && (
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                                  style={{
                                    backgroundColor: tenant.primary_color || '#000000',
                                  }}
                                />
                              )}
                              <item.icon
                                className={cn(
                                  'w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105',
                                  isItemActive
                                    ? ''
                                    : 'text-neutral-400 group-hover:text-neutral-600',
                                )}
                                style={
                                  isItemActive
                                    ? {
                                        color: tenant.primary_color || '#000000',
                                      }
                                    : undefined
                                }
                              />
                              <span className="text-sm tracking-tight leading-none">
                                {item.label}
                              </span>
                              {isItemActive && (
                                <ChevronRight className="h-3.5 w-3.5 ml-auto text-neutral-400" />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-neutral-100 bg-white flex-shrink-0">
          {/* User info + locale (hidden in collapsed mode) */}
          {!isCollapsed && (
            <div className="p-4 pb-0">
              {adminUser && (
                <div className="flex items-center gap-3 px-3 py-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center border border-neutral-200">
                    <span className="text-xs font-bold text-neutral-600">
                      {(adminUser.name || 'A').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {adminUser.name || 'Admin'}
                    </p>
                  </div>
                </div>
              )}
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium group"
                >
                  <LogOut className="h-4 w-4 group-hover:text-red-700" />
                  {tc('logout')}
                </button>
              </form>
            </div>
          )}

          {/* Collapse toggle */}
          <div className={cn('border-t border-neutral-100', isCollapsed ? 'p-2' : 'p-3')}>
            <Tooltip label={isCollapsed ? t('expand') : t('collapse')} show={isCollapsed}>
              <button
                type="button"
                onClick={toggleCollapsed}
                className={cn(
                  'hidden lg:flex items-center rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors text-sm font-medium w-full',
                  isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                )}
              >
                {isCollapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <>
                    <ChevronsLeft className="h-4 w-4" />
                    <span>{t('collapse')}</span>
                  </>
                )}
              </button>
            </Tooltip>

            {/* Collapsed mode: show sign-out icon */}
            {isCollapsed && (
              <Tooltip label={tc('logout')} show={isCollapsed}>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex items-center justify-center w-full px-2 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors group"
                  >
                    <LogOut className="h-4 w-4 group-hover:text-red-700" />
                  </button>
                </form>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
