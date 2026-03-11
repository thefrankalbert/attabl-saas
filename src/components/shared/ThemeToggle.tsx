'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface ThemeToggleProps {
  /** Additional CSS classes for the button */
  className?: string;
  /** Size of the icon in pixels (default: 16 = w-4 h-4) */
  iconSize?: number;
  /** Optional label rendered next to the icon (for inline menu usage) */
  label?: string;
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
export function ThemeToggle({ className, iconSize = 16, label }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const defaultClass = label
    ? 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-app-text-secondary hover:text-app-text hover:bg-app-hover transition-colors w-full text-left'
    : 'w-8 h-8 flex items-center justify-center rounded-lg text-app-text-muted hover:bg-app-hover hover:text-app-text-secondary transition-colors touch-manipulation';

  if (!mounted) {
    return (
      <div
        className={
          className ??
          (label
            ? 'flex items-center gap-3 px-3 py-2 h-9'
            : 'w-8 h-8 flex items-center justify-center rounded-lg')
        }
      />
    );
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
        <Sun className="shrink-0" style={{ width: iconSize, height: iconSize }} />
      ) : (
        <Moon className="shrink-0" style={{ width: iconSize, height: iconSize }} />
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
