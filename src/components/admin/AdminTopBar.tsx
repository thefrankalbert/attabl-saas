'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Maximize, Minimize } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isImmersivePage } from '@/lib/constants';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Types ──────────────────────────────────────────────

interface AdminTopBarProps {
  basePath: string;
  notifications?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────

export function AdminTopBar({ basePath, notifications, breadcrumbs }: AdminTopBarProps) {
  const pathname = usePathname();
  const { resolved, setTheme } = useTheme();
  const t = useTranslations('admin');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state + persist preference in sessionStorage
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      try {
        if (fs) sessionStorage.setItem('attabl-fs', '1');
        else sessionStorage.removeItem('attabl-fs');
      } catch {}
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Restore fullscreen on mount if it was active (survives client-side navigation)
  useEffect(() => {
    try {
      if (sessionStorage.getItem('attabl-fs') === '1' && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  if (isImmersivePage(pathname)) return null;

  return (
    <header className="shrink-0 h-12 bg-app-bg flex items-center px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Breadcrumbs — left side */}
      <div className="flex-1 min-w-0">{breadcrumbs}</div>
      <div className="flex items-center gap-1 shrink-0">
        {notifications}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text-secondary transition-colors touch-manipulation"
          title={isFullscreen ? t('topbar.exitFullscreen') : t('topbar.fullscreen')}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text-secondary transition-colors touch-manipulation"
          title={t('topbar.toggleTheme')}
        >
          {resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
