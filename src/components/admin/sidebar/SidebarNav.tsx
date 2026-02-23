'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, type NavGroupConfig } from '@/lib/layout/navigation-config';
import { NavGroup, type NavGroupItem } from './NavGroup';
import type { RolePermissions } from '@/lib/permissions';
import type { NavItemPermission } from '@/lib/permissions';
import type { PermissionCode } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';

// ─── Storage Keys ───────────────────────────────────────

const EXPANDED_GROUPS_KEY = 'attabl-sidebar-expanded';

// ─── Types ──────────────────────────────────────────────

interface SidebarNavProps {
  basePath: string;
  isCollapsed: boolean;
  primaryColor?: string;
  role?: AdminRole;
  permissions: RolePermissions | null;
  effectivePerms: Record<PermissionCode, boolean> | null;
  onToggleCollapsed: () => void;
}

// ─── Resolved group with full hrefs and translated labels ─

interface ResolvedNavGroup {
  id: string;
  title: string;
  icon: NavGroupConfig['icon'];
  items: NavGroupItem[];
  directLink?: string;
  highlight?: boolean;
}

// ─── Component ──────────────────────────────────────────

export function SidebarNav({
  basePath,
  isCollapsed,
  primaryColor,
  role,
  permissions,
  effectivePerms,
  onToggleCollapsed,
}: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations('sidebar');

  // ─── Permission checking ──────────────────────────────

  const checkPermission = useCallback(
    (legacyPerm?: NavItemPermission, newPerm?: PermissionCode): boolean => {
      // If we have the new 3-level permission system, prefer it
      if (newPerm && effectivePerms) {
        return effectivePerms[newPerm] ?? true;
      }
      // Fallback to legacy role-based permissions
      if (legacyPerm && permissions) {
        const val = permissions[legacyPerm];
        return typeof val === 'boolean' ? val : !!val;
      }
      return true;
    },
    [effectivePerms, permissions],
  );

  // ─── Resolve nav groups from config ───────────────────

  const filteredNavGroups: ResolvedNavGroup[] = useMemo(() => {
    return NAV_GROUPS.map((group) => {
      // Check group-level permission (for direct-link groups like POS/Kitchen)
      if (group.requiredPermission || group.permissionCode) {
        if (!checkPermission(group.requiredPermission, group.permissionCode)) return null;
      }

      // Map and filter sub-items
      const filteredItems: NavGroupItem[] = group.items
        .filter((item) => {
          if (item.ownerOnly) return role === 'owner';
          return checkPermission(item.requiredPermission, item.permissionCode);
        })
        .map((item) => ({
          href: `${basePath}${item.path}`,
          icon: item.icon,
          label: t(item.labelKey),
          highlight: item.highlight,
        }));

      // If group has sub-items and all were filtered out, hide the group
      if (group.items.length > 0 && filteredItems.length === 0) return null;

      const resolved: ResolvedNavGroup = {
        id: group.id,
        title: t(group.titleKey),
        icon: group.icon,
        items: filteredItems,
        directLink: group.directPath !== undefined ? `${basePath}${group.directPath}` : undefined,
        highlight: group.highlight,
      };

      return resolved;
    }).filter((g): g is ResolvedNavGroup => g !== null);
  }, [basePath, checkPermission, role, t]);

  // ─── Expanded groups state ────────────────────────────

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

  // ─── Render ───────────────────────────────────────────

  return (
    <nav
      className={cn(
        'flex-1 min-h-0 overflow-y-auto py-4',
        isCollapsed ? 'px-1.5 space-y-1' : 'px-3 space-y-1',
      )}
    >
      {filteredNavGroups.map((group) => (
        <NavGroup
          key={group.id}
          id={group.id}
          title={group.title}
          icon={group.icon}
          items={group.items}
          directLink={group.directLink}
          highlight={group.highlight}
          isCollapsed={isCollapsed}
          isExpanded={expandedGroups[group.id] ?? false}
          primaryColor={primaryColor}
          onToggle={toggleGroup}
          onToggleCollapsed={onToggleCollapsed}
        />
      ))}
    </nav>
  );
}
