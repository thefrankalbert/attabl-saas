'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, BOTTOM_NAV_ITEMS } from '@/lib/layout/navigation-config';
import { isImmersivePage } from '@/lib/constants';
import { getHiddenNav } from '@/lib/segment-features';
import { getSegmentFamily } from '@/lib/segment-terms';
import type { AdminRole } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface AdminBottomNavProps {
  basePath: string;
  role: AdminRole;
  establishmentType?: string;
}

// ─── Component ──────────────────────────────────────────

export function AdminBottomNav({ basePath, role, establishmentType }: AdminBottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations('sidebar');
  const tSeg = useTranslations('segment');

  // Hide bottom nav on immersive pages (KDS, POS) - they need full screen
  if (isImmersivePage(pathname)) return null;

  // Segment-aware label overrides (consistent with AdminSidebar)
  const family = getSegmentFamily(establishmentType);
  const segmentLabelOverrides: Record<string, string> = {
    navDishes: tSeg(`${family}.items`),
    navKitchen: tSeg(`${family}.productionKds`),
    navRecipes: tSeg(`${family}.recipes`),
  };
  const resolveLabel = (key: string) => segmentLabelOverrides[key] ?? t(key);

  // Get the 5 bottom nav item IDs for this role
  const itemIds = BOTTOM_NAV_ITEMS[role] ?? BOTTOM_NAV_ITEMS.admin;
  const { groupIds: hiddenGroupIds } = getHiddenNav(establishmentType);

  // Resolve each ID to its NavGroupConfig, filtering out segment-hidden groups
  const items = itemIds
    .filter((id) => !hiddenGroupIds.has(id))
    .map((id) => NAV_GROUPS.find((g) => g.id === id))
    .filter((g): g is (typeof NAV_GROUPS)[number] => g !== undefined);

  return (
    <nav
      className="shrink-0 bg-app-card border-t border-app-border transition-colors duration-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {items.map((group) => {
          const href =
            group.directPath !== undefined
              ? `${basePath}${group.directPath}`
              : group.items.length > 0
                ? `${basePath}${group.items[0].path}`
                : basePath;

          // Check if this nav item is active
          const isActive =
            group.directPath !== undefined
              ? group.directPath === ''
                ? pathname === basePath || pathname === `${basePath}/`
                : pathname.startsWith(`${basePath}${group.directPath}`)
              : group.items.some((item) => pathname.startsWith(`${basePath}${item.path}`));

          const Icon = group.icon;
          const label = resolveLabel(group.titleKey);

          return (
            <Link
              key={group.id}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full',
                'text-app-text-muted transition-colors duration-150',
                isActive && 'text-accent',
              )}
            >
              <Icon
                className={cn('h-5 w-5 shrink-0', isActive ? 'stroke-[2.5]' : 'stroke-[1.5]')}
              />
              <span
                className={cn(
                  'text-[11px] @sm:text-xs leading-tight truncate max-w-[72px]',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
