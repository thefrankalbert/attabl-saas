'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Settings, LogOut, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarTooltip } from './SidebarTooltip';

// ─── Types ──────────────────────────────────────────────

interface SidebarFooterProps {
  basePath: string;
  isCollapsed: boolean;
  adminUser?: {
    name?: string;
    role: string;
  };
  onToggleCollapsed: () => void;
}

// ─── Component ──────────────────────────────────────────

export function SidebarFooter({
  basePath,
  isCollapsed,
  adminUser,
  onToggleCollapsed,
}: SidebarFooterProps) {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');

  return (
    <div className="border-t border-neutral-100 bg-white flex-shrink-0">
      {/* User info (hidden in collapsed mode) */}
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
          <div className="flex items-center gap-2">
            <form action="/api/auth/signout" method="post" className="flex-1">
              <button
                type="submit"
                className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium group"
              >
                <LogOut className="h-4 w-4 group-hover:text-red-700" />
                {tc('logout')}
              </button>
            </form>
            <Link
              href={`${basePath}/settings`}
              className="flex items-center justify-center px-2.5 py-2.5 rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors"
              aria-label={t('navGeneral')}
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className={cn('border-t border-neutral-100', isCollapsed ? 'p-2' : 'p-3')}>
        <SidebarTooltip label={isCollapsed ? t('expand') : t('collapse')} show={isCollapsed}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'hidden lg:flex items-center rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors text-sm font-medium w-full touch-manipulation',
              isCollapsed
                ? 'justify-center px-2 py-2.5 min-h-[44px]'
                : 'gap-3 px-3 py-2.5 min-h-[44px]',
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
        </SidebarTooltip>

        {/* Collapsed mode: show settings + sign-out icons */}
        {isCollapsed && (
          <>
            <SidebarTooltip label={t('navGeneral')} show={isCollapsed}>
              <Link
                href={`${basePath}/settings`}
                className="flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation"
                aria-label={t('navGeneral')}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </SidebarTooltip>
            <SidebarTooltip label={tc('logout')} show={isCollapsed}>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-red-600 hover:bg-red-50 transition-colors group touch-manipulation"
                >
                  <LogOut className="h-4 w-4 group-hover:text-red-700" />
                </button>
              </form>
            </SidebarTooltip>
          </>
        )}
      </div>
    </div>
  );
}
