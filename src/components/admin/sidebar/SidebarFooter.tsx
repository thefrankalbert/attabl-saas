'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Settings, LogOut, ChevronsLeft, ChevronsRight, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarTooltip } from './SidebarTooltip';

// ─── Types ──────────────────────────────────────────────

interface SidebarFooterProps {
  basePath: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

// ─── Component ──────────────────────────────────────────

export function SidebarFooter({
  basePath,
  isCollapsed,
  onToggleCollapsed,
  isFullscreen,
  onToggleFullscreen,
}: SidebarFooterProps) {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');

  return (
    <div className="border-t border-neutral-100 bg-white flex-shrink-0">
      {/* Actions — always in the same order above collapse button */}
      <div className={cn('space-y-0.5', isCollapsed ? 'p-2' : 'px-3 pt-3 pb-0')}>
        {/* Settings */}
        <SidebarTooltip label={t('navGeneral')} show={isCollapsed}>
          <Link
            href={`${basePath}/settings`}
            className={cn(
              'flex items-center rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation',
              isCollapsed
                ? 'justify-center w-full px-2 py-2.5 min-h-[44px]'
                : 'gap-2.5 px-3 py-2 text-xs font-medium',
            )}
            aria-label={t('navGeneral')}
          >
            <Settings className={isCollapsed ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            {!isCollapsed && t('navGeneral')}
          </Link>
        </SidebarTooltip>

        {/* Fullscreen */}
        <SidebarTooltip
          label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          show={isCollapsed}
        >
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={cn(
              'flex items-center rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation',
              isCollapsed
                ? 'justify-center w-full px-2 py-2.5 min-h-[44px]'
                : 'gap-2.5 px-3 py-2 text-xs font-medium',
            )}
            aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          >
            {isFullscreen ? (
              <Minimize className={isCollapsed ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            ) : (
              <Maximize className={isCollapsed ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            )}
            {!isCollapsed && (isFullscreen ? t('exitFullscreen') : t('fullscreen'))}
          </button>
        </SidebarTooltip>

        {/* Logout */}
        <div
          className={cn(isCollapsed ? 'mt-1 pt-1' : 'mt-0.5 pt-0.5', 'border-t border-neutral-100')}
        >
          <SidebarTooltip label={tc('logout')} show={isCollapsed}>
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className={cn(
                  'flex items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors touch-manipulation',
                  isCollapsed
                    ? 'justify-center w-full px-2 py-2.5 min-h-[44px]'
                    : 'gap-2.5 px-3 py-2 w-full text-xs font-medium',
                )}
              >
                <LogOut className={isCollapsed ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                {!isCollapsed && tc('logout')}
              </button>
            </form>
          </SidebarTooltip>
        </div>
      </div>

      {/* Collapse toggle — ALWAYS at the very bottom */}
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
      </div>
    </div>
  );
}
