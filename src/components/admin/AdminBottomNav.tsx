'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, BOTTOM_NAV_ITEMS } from '@/lib/layout/navigation-config';
import type { AdminRole } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface AdminBottomNavProps {
  basePath: string;
  role: AdminRole;
  primaryColor?: string;
}

// ─── Component ──────────────────────────────────────────

const IMMERSIVE_SEGMENTS = ['/kitchen', '/pos'];

export function AdminBottomNav({ basePath, role, primaryColor }: AdminBottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations('sidebar');

  // Hide bottom nav on immersive pages (KDS, POS) — they need full screen
  if (IMMERSIVE_SEGMENTS.some((seg) => pathname?.includes(`/admin${seg}`))) return null;

  // Get the 5 bottom nav item IDs for this role
  const itemIds = BOTTOM_NAV_ITEMS[role] ?? BOTTOM_NAV_ITEMS.admin;

  // Resolve each ID to its NavGroupConfig
  const items = itemIds
    .map((id) => NAV_GROUPS.find((g) => g.id === id))
    .filter((g): g is (typeof NAV_GROUPS)[number] => g !== undefined);

  return (
    <nav
      className="shrink-0 bg-[#111827] border-t border-white/10"
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
          const label = t(group.titleKey);

          return (
            <Link
              key={group.id}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full',
                'text-white/40 transition-colors duration-150',
                isActive && 'text-[#CCFF00]',
              )}
              style={isActive && primaryColor ? { color: primaryColor } : undefined}
            >
              <Icon
                className={cn('h-5 w-5 shrink-0', isActive ? 'stroke-[2.5]' : 'stroke-[1.5]')}
              />
              <span
                className={cn(
                  'text-[10px] leading-tight truncate max-w-[64px]',
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
