'use client';

import { useLayoutEffect, type ReactNode } from 'react';

/**
 * Forces light mode for tenant-facing (client) pages.
 * Uses inline styles for SSR (before JS runs) and switches <html> class
 * from "dark" to "light" on hydration so Tailwind classes resolve correctly.
 */
export function TenantLightMode({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains('dark');
    const originalBg = document.body.style.backgroundColor;
    const originalColor = document.body.style.color;
    const originalColorScheme = html.style.colorScheme;

    // Switch from dark to light for Tailwind classes
    html.classList.remove('dark');
    html.classList.add('light');
    html.style.colorScheme = 'light';
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.color = '#111111';

    return () => {
      html.classList.remove('light');
      if (hadDark) html.classList.add('dark');
      html.style.colorScheme = originalColorScheme;
      document.body.style.backgroundColor = originalBg;
      document.body.style.color = originalColor;
    };
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#ffffff', color: '#111111', colorScheme: 'light' }}
    >
      {children}
    </div>
  );
}
