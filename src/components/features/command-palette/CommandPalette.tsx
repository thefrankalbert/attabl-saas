'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Search, ArrowRight } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { usePermissions } from '@/hooks/usePermissions';
import { NAV_GROUPS } from '@/lib/layout/navigation-config';
import { canOpenAdminSubPath } from '@/lib/auth/admin-route-permissions';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('sidebar');
  const tc = useTranslations('commandPalette');
  const { permissions, can } = usePermissions();

  const site = params?.site as string | undefined;
  const basePath = site ? `/sites/${site}/admin` : '/admin';

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // A link is listed only if the member may open its route: same rule as the
  // middleware, read from the same effective permissions (owner overrides
  // included), so no entry ends on /unauthorized.
  const isVisible = useCallback(
    (subPath: string) => canOpenAdminSubPath(subPath, permissions),
    [permissions],
  );

  // Build flat list of navigation items from NAV_GROUPS
  const navItems = useMemo(() => {
    const items: { label: string; path: string; icon: typeof Search; group: string }[] = [];

    for (const group of NAV_GROUPS) {
      if (group.directPath !== undefined && isVisible(group.directPath)) {
        // Direct link group (Dashboard, Orders, POS, Kitchen, Service)
        items.push({
          label: t(group.titleKey),
          path: `${basePath}${group.directPath}`,
          icon: group.icon,
          group: tc('navigation'),
        });
      }

      // Sub-items
      for (const item of group.items) {
        if (!isVisible(item.path)) continue;
        items.push({
          label: t(item.labelKey),
          path: `${basePath}${item.path}`,
          icon: item.icon,
          group: t(group.titleKey),
        });
      }
    }

    // Always add Settings and Users if permitted
    if (isVisible('/settings')) {
      items.push({
        label: tc('settings'),
        path: `${basePath}/settings`,
        icon: NAV_GROUPS[0].icon, // fallback icon
        group: tc('navigation'),
      });
    }
    if (isVisible('/users')) {
      items.push({
        label: tc('users'),
        path: `${basePath}/users`,
        icon: NAV_GROUPS[0].icon,
        group: tc('navigation'),
      });
    }

    return items;
  }, [basePath, isVisible, t, tc]);

  // Quick actions
  const quickActions = useMemo(() => {
    const actions: { label: string; path: string; icon: typeof Plus }[] = [];

    // Each quick action needs the permission its server action enforces, not
    // just the right to open the page.
    if (can('pos.use')) {
      actions.push({ label: tc('newOrder'), path: `${basePath}/pos`, icon: Plus });
    }
    if (can('menu.edit')) {
      actions.push({ label: tc('addDish'), path: `${basePath}/items?action=add`, icon: Plus });
    }
    if (can('team.manage')) {
      actions.push({
        label: tc('inviteUser'),
        path: `${basePath}/users?action=invite`,
        icon: Plus,
      });
    }

    return actions;
  }, [basePath, can, tc]);

  const runCommand = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={tc('placeholder')} />
      <CommandList>
        <CommandEmpty>{tc('noResults')}</CommandEmpty>

        {quickActions.length > 0 && (
          <CommandGroup heading={tc('quickActions')}>
            {quickActions.map((action) => (
              <CommandItem key={action.path} onSelect={() => runCommand(action.path)}>
                <action.icon className="mr-2 h-4 w-4 text-app-text-secondary" />
                <span>{action.label}</span>
                <ArrowRight className="ml-auto h-3 w-3 text-app-text-muted" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Group navigation items by their group label */}
        {Object.entries(
          navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
            (acc[item.group] ??= []).push(item);
            return acc;
          }, {}),
        ).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem key={item.path} onSelect={() => runCommand(item.path)}>
                <item.icon className="mr-2 h-4 w-4 text-app-text-secondary" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
