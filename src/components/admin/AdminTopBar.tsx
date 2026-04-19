'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Maximize, Minimize } from 'lucide-react';
import { isImmersivePage } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { TopbarSearch } from './topbar/TopbarSearch';

interface AdminTopBarProps {
  notifications?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
}

export function AdminTopBar({ notifications, breadcrumbs }: AdminTopBarProps) {
  const pathname = usePathname();
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <header className="shrink-0 h-[52px] bg-app-bg/85 backdrop-blur-md border-b border-app-border flex items-center px-4 sm:px-6 transition-colors duration-200 relative z-40 overflow-hidden">
      {/* Breadcrumbs — left side */}
      <div className="flex-1 min-w-0 overflow-hidden text-[13px] text-app-text-secondary">
        {breadcrumbs}
      </div>

      {/* Right rail — search + bell + theme + fullscreen */}
      <div className="flex items-center gap-2 shrink-0">
        <TopbarSearch />
        {notifications}
        <ThemeToggle
          className="w-[30px] h-[30px] rounded-md border border-app-border bg-app-card text-app-text-secondary hover:bg-app-elevated hover:text-app-text"
          iconSize={14}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          className="w-[30px] h-[30px] rounded-md border border-app-border bg-app-card text-app-text-secondary hover:bg-app-elevated hover:text-app-text"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="w-[14px] h-[14px]" />
          ) : (
            <Maximize className="w-[14px] h-[14px]" />
          )}
        </Button>
      </div>
    </header>
  );
}
