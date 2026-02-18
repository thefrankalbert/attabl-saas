'use client';

import { createContext, useContext, useCallback, useMemo, useSyncExternalStore } from 'react';

// ─── Types ──────────────────────────────────────────────

interface SidebarContextValue {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

// ─── Context ────────────────────────────────────────────

const SidebarContext = createContext<SidebarContextValue | null>(null);

// ─── Storage Key ────────────────────────────────────────

const STORAGE_KEY = 'attabl-sidebar-collapsed';

// ─── External Store (localStorage) ──────────────────────

let listeners: Array<() => void> = [];

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void): () => void {
  listeners = [...listeners, callback];
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

// ─── Provider ───────────────────────────────────────────

interface SidebarProviderProps {
  children: React.ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleCollapsed = useCallback(() => {
    try {
      const next = !getSnapshot();
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage may not be available
    }
    emitChange();
  }, []);

  const value = useMemo(
    () => ({
      isCollapsed,
      toggleCollapsed,
    }),
    [isCollapsed, toggleCollapsed],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
