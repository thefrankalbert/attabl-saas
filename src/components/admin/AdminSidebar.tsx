'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '@/lib/layout/navigation-config';
import type { NavGroupConfig, NavItemConfig } from '@/lib/layout/navigation-config';

// ─── Types ──────────────────────────────────────────────

interface AdminSidebarProps {
  basePath: string;
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
  };
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────

/** IDs of groups that render at the bottom of the sidebar */
const BOTTOM_GROUP_IDS = new Set(['pos', 'kitchen', 'service']);

/** Settings link appended after all NAV_GROUPS */
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

function isGroupActive(pathname: string, basePath: string, group: NavGroupConfig): boolean {
  if (group.directPath !== undefined) {
    return isPathActive(pathname, basePath, group.directPath);
  }
  return group.items.some((item) => isPathActive(pathname, basePath, item.path));
}

// ─── Component ──────────────────────────────────────────

export function AdminSidebar({ basePath, tenant, className }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('sidebar');
  const [collapsed, setCollapsed] = useState(false);

  // All collapsible groups start expanded
  const collapsibleGroups = NAV_GROUPS.filter((g) => g.items.length > 0);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collapsibleGroups.map((g) => g.id)),
  );

  const toggleGroup = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Split groups into main (top) and bottom sections
  const mainGroups = NAV_GROUPS.filter((g) => !BOTTOM_GROUP_IDS.has(g.id));
  const bottomGroups = NAV_GROUPS.filter((g) => BOTTOM_GROUP_IDS.has(g.id));

  const settingsActive = isPathActive(pathname, basePath, SETTINGS_ITEM.path);

  return (
    <aside
      className={cn(
        'shrink-0 bg-app-card flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
        className,
      )}
    >
      {/* ── Tenant profile header ── */}
      <div className="shrink-0 px-4 pt-4 pb-6">
        <Link
          href={basePath}
          className={cn('flex items-center gap-3 group', collapsed && 'justify-center')}
          title={collapsed ? tenant.name : undefined}
        >
          {tenant.logo_url ? (
            <Image
              src={tenant.logo_url}
              alt={tenant.name}
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-app-elevated flex items-center justify-center font-bold text-xs text-app-text-secondary shrink-0">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            className={cn(
              'font-semibold text-sm text-app-text truncate group-hover:text-accent transition-colors',
              collapsed && 'hidden',
            )}
          >
            {tenant.name}
          </span>
        </Link>
      </div>

      {/* ── Scrollable navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {mainGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            basePath={basePath}
            pathname={pathname}
            isExpanded={expanded.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            collapsed={collapsed}
            t={t}
          />
        ))}
      </nav>

      {/* ── Collapse toggle ── */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="w-full flex items-center justify-center py-2 text-app-text-muted/50 hover:text-app-text-muted transition-colors"
          title={collapsed ? t('expand') : t('collapse')}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* ── Bottom section ── */}
      <div className="shrink-0 px-3 py-3 space-y-1">
        {bottomGroups.map((group) => {
          const href = group.directPath !== undefined ? `${basePath}${group.directPath}` : basePath;
          const active = isGroupActive(pathname, basePath, group);
          const Icon = group.icon;

          return (
            <Link
              key={group.id}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                active
                  ? 'text-accent bg-accent/8 border-l-2 border-accent'
                  : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                collapsed && 'justify-center',
              )}
              title={collapsed ? t(group.titleKey) : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className={cn('truncate', collapsed && 'hidden')}>{t(group.titleKey)}</span>
            </Link>
          );
        })}

        {/* Settings */}
        <Link
          href={`${basePath}${SETTINGS_ITEM.path}`}
          className={cn(
            'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
            settingsActive
              ? 'text-accent bg-accent/8 border-l-2 border-accent'
              : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
            collapsed && 'justify-center',
          )}
          title={collapsed ? t(SETTINGS_ITEM.labelKey) : undefined}
        >
          <SETTINGS_ITEM.icon className="w-4 h-4 shrink-0" />
          <span className={cn('truncate', collapsed && 'hidden')}>{t(SETTINGS_ITEM.labelKey)}</span>
        </Link>
      </div>
    </aside>
  );
}

// ─── Sidebar Group ──────────────────────────────────────

interface SidebarGroupProps {
  group: NavGroupConfig;
  basePath: string;
  pathname: string;
  isExpanded: boolean;
  onToggle: () => void;
  collapsed: boolean;
  t: ReturnType<typeof useTranslations>;
}

function SidebarGroup({
  group,
  basePath,
  pathname,
  isExpanded,
  onToggle,
  collapsed,
  t,
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
          'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
          active
            ? 'text-accent bg-accent/8 border-l-2 border-accent'
            : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
          collapsed && 'justify-center',
        )}
        title={collapsed ? t(group.titleKey) : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className={cn('truncate', collapsed && 'hidden')}>{t(group.titleKey)}</span>
      </Link>
    );
  }

  // Collapsible group with sub-items
  const hasActiveChild = group.items.some((item) => isPathActive(pathname, basePath, item.path));

  // When sidebar is collapsed, hide group labels and children
  if (collapsed) {
    return (
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
                'flex items-center justify-center px-3 py-1.5 rounded-lg text-sm transition-colors',
                active
                  ? 'text-accent bg-accent/8 border-l-2 border-accent'
                  : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
              )}
              title={t(item.labelKey)}
            >
              <Icon className="w-4 h-4 shrink-0" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-medium uppercase tracking-widest transition-colors',
          hasActiveChild
            ? 'text-app-text-muted/60'
            : 'text-app-text-muted/60 hover:text-app-text-secondary',
        )}
      >
        <span>{t(group.titleKey)}</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 transition-transform duration-200',
            !isExpanded && '-rotate-90',
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-0.5 space-y-0.5">
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
                    ? 'text-accent bg-accent/8 border-l-2 border-accent'
                    : 'text-app-text-secondary hover:text-app-text hover:bg-app-hover',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
