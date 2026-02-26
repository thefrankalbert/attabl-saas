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
      {/* Actions (hidden in collapsed mode) */}
      {!isCollapsed && (
        <div className="px-3 pt-3 pb-0 space-y-1">
          {/* Settings + Fullscreen row */}
          <div className="flex items-center gap-1">
            <Link
              href={`${basePath}/settings`}
              className="flex items-center gap-2.5 flex-1 px-3 py-2 rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors text-xs font-medium"
              aria-label={t('navGeneral')}
            >
              <Settings className="h-3.5 w-3.5" />
              {t('navGeneral')}
            </Link>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition-colors"
              aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
            >
              {isFullscreen ? (
                <Minimize className="h-3.5 w-3.5" />
              ) : (
                <Maximize className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {/* Logout — visually separated */}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors text-xs font-medium"
            >
              <LogOut className="h-3.5 w-3.5" />
              {tc('logout')}
            </button>
          </form>
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
            <SidebarTooltip
              label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              show={isCollapsed}
            >
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation"
                aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </SidebarTooltip>
            <SidebarTooltip label={t('navGeneral')} show={isCollapsed}>
              <Link
                href={`${basePath}/settings`}
                className="flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors touch-manipulation"
                aria-label={t('navGeneral')}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </SidebarTooltip>
            {/* Logout separated with spacing */}
            <div className="mt-2 pt-2 border-t border-neutral-100">
              <SidebarTooltip label={tc('logout')} show={isCollapsed}>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex items-center justify-center w-full px-2 py-2.5 min-h-[44px] rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors group touch-manipulation"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              </SidebarTooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
