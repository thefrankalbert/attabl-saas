'use client';

import { PanelLeft, Sun, Moon, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { TopbarSearch } from '../topbar/TopbarSearch';
import { HeaderDateFilter } from './HeaderDateFilter';

interface ShellHeaderProps {
  onToggleSidebar: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  /** Page title node (breadcrumbs / current page label) */
  title?: React.ReactNode;
  notifications?: React.ReactNode;
}

export function ShellHeader({
  onToggleSidebar,
  isDark,
  onToggleTheme,
  title,
  notifications,
}: ShellHeaderProps) {
  const t = useTranslations('common');

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label={t('aria.toggleSidebar')}
        className="h-7 w-7 rounded-[0.625rem] text-[var(--foreground)] hover:bg-[var(--accent)]"
      >
        <PanelLeft className="size-4" />
      </Button>
      <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
      <div className="min-w-0 truncate text-sm font-medium text-[var(--foreground)]">{title}</div>

      <TopbarSearch />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('aria.search')}
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'k',
                metaKey: true,
                ctrlKey: true,
                bubbles: true,
              }),
            )
          }
          className="h-7 w-7 rounded-[0.625rem] text-[var(--foreground)] hover:bg-[var(--accent)] md:hidden"
        >
          <Search className="size-4" />
        </Button>
        <HeaderDateFilter isDark={isDark} />
        {notifications}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          aria-label={t('aria.toggleTheme')}
          className="h-7 w-7 rounded-[0.625rem] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
