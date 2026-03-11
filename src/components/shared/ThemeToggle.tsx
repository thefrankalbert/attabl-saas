'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface ThemeToggleProps {
  /** Additional CSS classes for the button */
  className?: string;
  /** Size of the icon in pixels (default: 16 = w-4 h-4) */
  iconSize?: number;
}

/** SSR-safe mount detection without useEffect + setState */
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Reusable dark/light mode toggle button.
 * Uses next-themes (root-level ThemeProvider) so it works on any page.
 * Renders a placeholder on server to avoid hydration mismatch.
 */
export function ThemeToggle({ className, iconSize = 16 }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const defaultClass =
    'w-8 h-8 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text-secondary transition-colors touch-manipulation';

  if (!mounted) {
    return <div className={className ?? 'w-8 h-8 flex items-center justify-center rounded-lg'} />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={className ?? defaultClass}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {isDark ? (
        <Sun style={{ width: iconSize, height: iconSize }} />
      ) : (
        <Moon style={{ width: iconSize, height: iconSize }} />
      )}
    </button>
  );
}
