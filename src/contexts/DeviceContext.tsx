'use client';

import { createContext, useContext, useSyncExternalStore, useMemo } from 'react';
import {
  MEDIA_QUERIES,
  getLayoutMode,
  type DeviceType,
  type LayoutMode,
} from '@/lib/layout/breakpoints';

// ─── Types ──────────────────────────────────────────────

interface DeviceContextValue {
  device: DeviceType;
  layoutMode: LayoutMode;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

// ─── Context ────────────────────────────────────────────

const DeviceContext = createContext<DeviceContextValue | null>(null);

// ─── External Store (matchMedia) ────────────────────────

function createMediaStore(query: string) {
  let listeners: Array<() => void> = [];

  function subscribe(callback: () => void) {
    if (typeof window === 'undefined') return () => {};
    const mql = window.matchMedia(query);
    const handler = () => callback();
    mql.addEventListener('change', handler);
    listeners = [...listeners, callback];
    return () => {
      mql.removeEventListener('change', handler);
      listeners = listeners.filter((l) => l !== callback);
    };
  }

  function getSnapshot(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }

  function getServerSnapshot(): boolean {
    return false;
  }

  return { subscribe, getSnapshot, getServerSnapshot };
}

const mobileStore = createMediaStore(MEDIA_QUERIES.mobile);
const tabletStore = createMediaStore(MEDIA_QUERIES.tablet);
const desktopStore = createMediaStore(MEDIA_QUERIES.desktop);

// ─── Provider ───────────────────────────────────────────

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useSyncExternalStore(
    mobileStore.subscribe,
    mobileStore.getSnapshot,
    mobileStore.getServerSnapshot,
  );
  const isTablet = useSyncExternalStore(
    tabletStore.subscribe,
    tabletStore.getSnapshot,
    tabletStore.getServerSnapshot,
  );
  const isDesktop = useSyncExternalStore(
    desktopStore.subscribe,
    desktopStore.getSnapshot,
    desktopStore.getServerSnapshot,
  );

  const value = useMemo(() => {
    const device: DeviceType = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';
    return {
      device,
      layoutMode: getLayoutMode(device),
      isMobile,
      isTablet,
      isDesktop,
    };
  }, [isMobile, isTablet, isDesktop]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────

export function useDeviceContext(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDeviceContext must be used within a DeviceProvider');
  }
  return context;
}
