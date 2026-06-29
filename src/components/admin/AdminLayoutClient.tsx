'use client';

import { useState, useEffect, useCallback } from 'react';
import { DeviceProvider, useDeviceContext } from '@/contexts/DeviceContext';
import { ShellHeader } from './shell/ShellHeader';
import { AdminBottomNav } from './AdminBottomNav';
import { ShellSidebar } from './shell/ShellSidebar';
import { SettingsDialog, type SettingsTab } from './shell/SettingsDialog';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { isAdminHome, isImmersivePage } from '@/lib/constants';
import type { AdminRole } from '@/types/admin.types';
import type { TenantSwitchOption } from '@/types/tenant-switch.types';

const SIDEBAR_STORAGE_KEY = 'attabl-sidebar-collapsed';
const THEME_STORAGE_KEY = 'attabl-admin-theme';

// ─── Inner Layout ───────────────────────────────────────

interface AdminLayoutInnerProps {
  children: React.ReactNode;
  isDevMode: boolean;
  basePath: string;
  role: AdminRole;
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
    subscription_plan?: string;
    establishment_type?: string;
  };
  userName?: string;
  userEmail?: string;
  /** 0..100 - passed to the sidebar usage card in the footer */
  ordersUsagePercent?: number;
  userTenants?: TenantSwitchOption[];
  notifications?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  /** Real nav badge counts (open orders / in-kitchen / active items) */
  navCounts?: { orders?: number; kitchen?: number; items?: number };
}

function AdminLayoutInner({
  children,
  isDevMode,
  basePath,
  role,
  tenant,
  userName,
  userEmail,
  userTenants,
  notifications,
  breadcrumbs,
  navCounts,
}: AdminLayoutInnerProps) {
  const { isMobile, isTablet } = useDeviceContext();
  const pathname = usePathname();
  const isHome = isAdminHome(pathname, basePath);
  const immersive = isImmersivePage(pathname);
  const showBottomNav = (isMobile || isTablet) && !isHome && !immersive;

  // Sidebar collapsed state - persisted to localStorage, respected across navigations
  // Use false as SSR default to avoid hydration mismatch, then sync from localStorage after mount
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    let initial = false;
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        initial = stored === 'true';
      } else {
        initial = window.innerWidth < 1024;
      }
    } catch {
      // localStorage unavailable
    }
    queueMicrotask(() => setSidebarCollapsed(initial));
  }, []);

  // Auto-collapse on tablet portrait, but only on initial mount / device change
  // NEVER auto-expand - user's explicit choice is always respected
  useEffect(() => {
    if (!isTablet || sidebarCollapsed) return;
    queueMicrotask(() => {
      setSidebarCollapsed(true);
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true');
      } catch {
        // localStorage unavailable
      }
    });
    // Only run when device type changes (tablet vs desktop), not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: auto-collapse must fire only on device-type change; adding sidebarCollapsed would re-collapse and fight the user's explicit expand action (2026-06-18)
  }, [isTablet]);

  const handleToggleCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  // Admin-local light/dark theme. Independent of the convive (which stays
  // forced-light). The `dark` class is toggled on the .admin-shell root only,
  // so the oklch neutral tokens scoped under .admin-shell.dark take effect.
  // SSR default = light; synced from localStorage / system after mount.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    let initial = false;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      initial =
        stored !== null
          ? stored === 'dark'
          : window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      // localStorage / matchMedia unavailable
    }
    queueMicrotask(() => setIsDark(initial));
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      } catch {}
      return next;
    });
  }, []);

  // Settings hub dialog (opened from the sidebar Parametres entry + account menu)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('compte');
  const openSettings = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  return (
    <div
      className={cn(
        'admin-shell flex h-dvh items-start overflow-hidden bg-[var(--sidebar)] transition-colors duration-200',
        isDark && 'dark',
      )}
    >
      {/* Sidebar - tablet & desktop, hidden on immersive pages */}
      {!immersive && (
        <ShellSidebar
          basePath={basePath}
          tenant={tenant}
          userName={userName}
          userEmail={userEmail}
          userTenants={userTenants}
          className="hidden lg:flex"
          collapsed={sidebarCollapsed}
          onOpenSettings={openSettings}
          counts={navCounts}
        />
      )}

      {/* Inset panel. Explicit height (parent uses items-start per the maquette,
          so flex stretch does not apply); h-[calc(100dvh-1rem)] = viewport minus
          the 0.5rem top/bottom margins, matching Dashboard.html calc(100svh-16px). */}
      <div className="flex h-[calc(100dvh-1rem)] min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-[0_1px_3px_0_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06)] m-2 lg:my-2 lg:ml-0 lg:mr-2">
        {!immersive && (
          <ShellHeader
            onToggleSidebar={handleToggleCollapsed}
            isDark={isDark}
            onToggleTheme={handleToggleTheme}
            title={breadcrumbs}
            notifications={notifications}
          />
        )}

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-[var(--card)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <main
          id="main-content"
          className={cn(
            'flex-1 min-h-0 @container overflow-y-auto flex flex-col',
            isDevMode && 'pt-6',
            showBottomNav && 'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <div className="flex-1 min-h-0 flex flex-col w-full">{children}</div>
        </main>

        {showBottomNav && (
          <AdminBottomNav
            basePath={basePath}
            role={role}
            establishmentType={tenant.establishment_type}
          />
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        basePath={basePath}
        userName={userName}
        userEmail={userEmail}
        tenant={tenant}
        isDark={isDark}
      />
    </div>
  );
}

// ─── Wrapper (provides device context) ──────────────────

interface AdminLayoutClientProps {
  children: React.ReactNode;
  isDevMode: boolean;
  basePath: string;
  role: AdminRole;
  tenant: {
    name: string;
    slug: string;
    logo_url?: string;
    subscription_plan?: string;
    establishment_type?: string;
  };
  userName?: string;
  userEmail?: string;
  ordersUsagePercent?: number;
  userTenants?: TenantSwitchOption[];
  notifications?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  navCounts?: { orders?: number; kitchen?: number; items?: number };
}

export function AdminLayoutClient({
  children,
  isDevMode,
  basePath,
  role,
  tenant,
  userName,
  userEmail,
  ordersUsagePercent,
  userTenants,
  notifications,
  breadcrumbs,
  navCounts,
}: AdminLayoutClientProps) {
  return (
    <DeviceProvider>
      <AdminLayoutInner
        isDevMode={isDevMode}
        basePath={basePath}
        role={role}
        tenant={tenant}
        userName={userName}
        userEmail={userEmail}
        ordersUsagePercent={ordersUsagePercent}
        userTenants={userTenants}
        notifications={notifications}
        breadcrumbs={breadcrumbs}
        navCounts={navCounts}
      >
        {children}
      </AdminLayoutInner>
    </DeviceProvider>
  );
}
