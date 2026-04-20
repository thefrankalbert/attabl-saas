'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './cc-shell.css';

type Theme = 'light' | 'dark';
export const CC_THEME_COOKIE = 'attabl-cc-theme';

interface CommandCenterShellProps {
  children: ReactNode;
  className?: string;
  /**
   * Theme chosen server-side from the `attabl-cc-theme` cookie. Passing this
   * eliminates the first-load flash (FOUC) that a client-only read from
   * localStorage would cause for returning dark-mode users.
   */
  defaultTheme?: Theme;
}

/**
 * Root wrapper for the Command Center redesign.
 * Exposes the `.cc-shell` CSS scope + a theme toggle button via context
 * (consumed by TopbarMinimal). Theme is persisted to an `attabl-cc-theme`
 * cookie so the server can pre-apply `data-cc-theme` on render and avoid FOUC.
 */
export function CommandCenterShell({
  children,
  className,
  defaultTheme = 'light',
}: CommandCenterShellProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  // Keep state in sync if the cookie changed in another tab.
  useEffect(() => {
    const onStorage = () => {
      try {
        const match = document.cookie.match(/(?:^|;\s*)attabl-cc-theme=(light|dark)/);
        if (match && match[1] !== theme) {
          queueMicrotask(() => setTheme(match[1] as Theme));
        }
      } catch {}
    };
    window.addEventListener('focus', onStorage);
    return () => window.removeEventListener('focus', onStorage);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      try {
        // 1 year, lax, full path so every admin route sees it next render.
        document.cookie = `${CC_THEME_COOKIE}=${next};max-age=${60 * 60 * 24 * 365};path=/;samesite=lax`;
      } catch {}
      return next;
    });
  };

  return (
    // NOTE: this page is NOT wrapped in AdminLayoutClient (see
    // src/app/admin/tenants/page.tsx - no intermediate layout.tsx). The shell
    // must therefore provide its own viewport anchor, which is why h-dvh is
    // used here. If this page is ever embedded under AdminLayoutClient, swap
    // this to `h-full min-h-0` to avoid a double viewport anchor.
    <div
      data-cc-theme={theme}
      className={cn('cc-shell flex h-dvh flex-col overflow-hidden', className)}
      data-cc-toggle-ref
    >
      {/* Expose the toggler via a custom event so Topbar can dispatch it */}
      <CommandCenterThemeBridge onToggle={toggleTheme} theme={theme} />
      {children}
    </div>
  );
}

/**
 * Thin bridge that wires a global event bus on window so nested components
 * (like TopbarMinimal) can request a theme toggle without prop drilling.
 */
function CommandCenterThemeBridge({ onToggle, theme }: { onToggle: () => void; theme: Theme }) {
  useEffect(() => {
    const handler = () => onToggle();
    window.addEventListener('cc:theme:toggle', handler as EventListener);
    return () => window.removeEventListener('cc:theme:toggle', handler as EventListener);
  }, [onToggle]);

  // Mirror theme on window for components that want to read it synchronously.
  useEffect(() => {
    (window as unknown as { __ccTheme?: Theme }).__ccTheme = theme;
  }, [theme]);

  return null;
}
