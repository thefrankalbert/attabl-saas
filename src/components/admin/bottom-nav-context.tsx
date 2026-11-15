'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * Whether the fixed mobile bottom nav (AdminBottomNav) is on screen. Decided ONCE
 * in AdminLayoutClient and read by AdminContentWrapper to reserve its height at
 * the end of the content. Recomputing it in the wrapper diverged from the real
 * nav (subdomain `/admin` home path, fractional widths around 1024 px).
 */
const BottomNavContext = createContext(false);

/**
 * Also lifts toasts above the nav: the Toaster lives in the root layout, outside
 * this subtree, so the offset goes on <html> while the nav is on screen.
 */
export function BottomNavProvider({ value, children }: { value: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!value) return;
    const root = document.documentElement;
    root.style.setProperty(
      '--toast-bottom-offset',
      'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 16px)',
    );
    return () => {
      root.style.removeProperty('--toast-bottom-offset');
    };
  }, [value]);
  return <BottomNavContext.Provider value={value}>{children}</BottomNavContext.Provider>;
}

export function useBottomNavVisible(): boolean {
  return useContext(BottomNavContext);
}

/** Room for the fixed bottom nav, placed AFTER the page content. */
export function BottomNavSpacer() {
  const visible = useBottomNavVisible();
  if (!visible) return null;
  return (
    <div aria-hidden="true" className="h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] shrink-0" />
  );
}
