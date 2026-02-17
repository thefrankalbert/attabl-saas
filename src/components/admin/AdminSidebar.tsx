'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  BookOpen,
  Settings,
  CreditCard,
  ChevronRight,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import { getRolePermissions, type NavItemPermission } from '@/lib/permissions';
import type { AdminRole } from '@/types/admin.types';

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

export function AdminSidebar({ tenant, adminUser, role, className }: AdminSidebarProps) {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');

  const roleLabels: Record<string, string> = {
    owner: t('roleOwner'),
    admin: t('roleAdmin'),
    manager: t('roleManager'),
    chef: t('roleKitchen'),
    waiter: t('roleServer'),
    cashier: t('roleStaff'),
  };

  // Sidebar is open only if it was toggled for the current pathname
  // Navigating to a new route automatically "closes" it since openForPath won't match
  const isOpen = openForPath === pathname;

  const toggleSidebar = () => setOpenForPath(isOpen ? null : pathname);

  const permissions = role ? getRolePermissions(role) : null;

  type NavItem = {
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    highlight?: boolean;
    requiredPermission?: NavItemPermission;
    ownerOnly?: boolean;
  };

  const NAV_GROUPS: { titleKey: string; items: NavItem[] }[] = [
    {
      titleKey: 'groupMain',
      items: [
        { href: `/sites/${tenant.slug}/admin`, icon: LayoutDashboard, label: t('navDashboard') },
        { href: `/sites/${tenant.slug}/admin/orders`, icon: ShoppingBag, label: t('navOrders') },
      ],
    },
    {
      titleKey: 'groupOrganization',
      items: [
        {
          href: `/sites/${tenant.slug}/admin/menus`,
          icon: ClipboardList,
          label: t('navMenus'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `/sites/${tenant.slug}/admin/categories`,
          icon: UtensilsCrossed,
          label: t('navCategories'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `/sites/${tenant.slug}/admin/items`,
          icon: BookOpen,
          label: t('navDishes'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `/sites/${tenant.slug}/admin/inventory`,
          icon: Package,
          label: t('navInventory'),
          requiredPermission: 'canViewStocks',
        },
        {
          href: `/sites/${tenant.slug}/admin/stock-history`,
          icon: History,
          label: t('navStockHistory'),
          requiredPermission: 'canViewStocks',
        },
        {
          href: `/sites/${tenant.slug}/admin/recipes`,
          icon: BookOpenCheck,
          label: t('navRecipes'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `/sites/${tenant.slug}/admin/suppliers`,
          icon: Truck,
          label: t('navSuppliers'),
          requiredPermission: 'canManageStocks',
        },
        {
          href: `/sites/${tenant.slug}/admin/suggestions`,
          icon: Lightbulb,
          label: t('navSuggestions'),
          requiredPermission: 'canManageMenus',
        },
        {
          href: `/sites/${tenant.slug}/admin/announcements`,
          icon: Megaphone,
          label: t('navAnnouncements'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `/sites/${tenant.slug}/admin/coupons`,
          icon: Tag,
          label: t('navCoupons'),
          requiredPermission: 'canManageSettings',
        },
      ],
    },
    {
      titleKey: 'groupTools',
      items: [
        {
          href: `/sites/${tenant.slug}/admin/pos`,
          icon: Laptop,
          label: t('navPos'),
          highlight: true,
          requiredPermission: 'canConfigurePOS',
        },
        {
          href: `/sites/${tenant.slug}/admin/kitchen`,
          icon: ChefHat,
          label: t('navKitchen'),
          highlight: true,
          requiredPermission: 'canConfigureKitchen',
        },
        {
          href: `/sites/${tenant.slug}/admin/qr-codes`,
          icon: QrCode,
          label: t('navQrCodes'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `/sites/${tenant.slug}/admin/reports`,
          icon: BarChart3,
          label: t('navReports'),
          requiredPermission: 'canViewAllStats',
        },
      ],
    },
    {
      titleKey: 'groupAdmin',
      items: [
        {
          href: `/sites/${tenant.slug}/admin/users`,
          icon: Users,
          label: t('navUsers'),
          requiredPermission: 'canManageUsers',
        },
        {
          href: `/sites/${tenant.slug}/admin/settings`,
          icon: Settings,
          label: t('navSettings'),
          requiredPermission: 'canManageSettings',
        },
        {
          href: `/sites/${tenant.slug}/admin/subscription`,
          icon: CreditCard,
          label: t('navSubscription'),
          ownerOnly: true,
        },
      ],
    },
  ];

  // Filter nav items based on role permissions
  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.ownerOnly) return role === 'owner';
      if (!item.requiredPermission || !permissions) return true;
      const val = permissions[item.requiredPermission];
      return typeof val === 'boolean' ? val : !!val;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden shadow-sm bg-white border border-neutral-200"
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
          'fixed inset-y-0 left-0 w-64 bg-white border-r border-neutral-100 z-40 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          className,
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex-shrink-0 flex items-center justify-between">
          <Link href={`/sites/${tenant.slug}/admin`} className="flex items-center gap-3 group">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="w-10 h-10 rounded-lg object-contain"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: tenant.primary_color || '#374151' }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-neutral-900 truncate uppercase tracking-tight">
                {tenant.name}
              </h2>
              <p className="text-xs text-neutral-500">
                {adminUser ? roleLabels[adminUser.role] || adminUser.role : 'Admin'}
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 space-y-6">
          {filteredNavGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              <p className="px-3 mb-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                {t(group.titleKey)}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isHighlight = 'highlight' in item && item.highlight;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 relative space-x-3',
                        isActive
                          ? 'bg-neutral-50 text-neutral-900 font-semibold'
                          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 font-medium',
                        isHighlight && !isActive && 'bg-blue-50/50 border border-blue-100/50',
                      )}
                    >
                      {isActive && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                          style={{ backgroundColor: tenant.primary_color || '#000000' }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          'w-[18px] h-[18px] transition-transform group-hover:scale-105',
                          isActive
                            ? ''
                            : isHighlight
                              ? 'text-blue-600'
                              : 'text-neutral-400 group-hover:text-neutral-600',
                        )}
                        style={isActive ? { color: tenant.primary_color || '#000000' } : undefined}
                      />
                      <span
                        className={cn(
                          'text-sm tracking-tight leading-none',
                          isHighlight && !isActive && 'text-blue-900 font-bold',
                        )}
                      >
                        {item.label}
                      </span>
                      {isActive && <ChevronRight className="h-4 w-4 ml-auto text-neutral-400" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 bg-white flex-shrink-0">
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
          <div className="px-3 mb-2">
            <LocaleSwitcher />
          </div>
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
      </aside>
    </>
  );
}
