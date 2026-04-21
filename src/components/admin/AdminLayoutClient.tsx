'use client';

import { useState, useEffect, useCallback } from 'react';
import { DeviceProvider, useDeviceContext } from '@/contexts/DeviceContext';
import { AdminTopBar } from './AdminTopBar';
import { AdminBottomNav } from './AdminBottomNav';
import { AdminSidebar } from './AdminSidebar';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { isAdminHome, isImmersivePage } from '@/lib/constants';
import type { AdminRole } from '@/types/admin.types';

const SIDEBAR_STORAGE_KEY = 'attabl-sidebar-collapsed';

// ─── Inner Layout ───────────────────────────────────────

interface TenantSwitchOption {
  id: string;
  name: string;
  slug: string;
}

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
}

function AdminLayoutInner({
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
}: AdminLayoutInnerProps) {
  const { isMobile, isTablet } = useDeviceContext();
  const pathname = usePathname();
  const isHome = isAdminHome(pathname, basePath);
  const immersive = isImmersivePage(pathname);

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
    setSidebarCollapsed(initial);
  }, []);

  // Auto-collapse on tablet portrait, but only on initial mount / device change
  // NEVER auto-expand - user's explicit choice is always respected
  useEffect(() => {
    if (isTablet && !sidebarCollapsed) {
      setSidebarCollapsed(true);
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true');
      } catch {}
    }
    // Only run when device type changes (tablet vs desktop), not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="admin-shell h-dvh overflow-hidden flex bg-app-bg transition-colors duration-200 relative z-0">
      {/* Sidebar - tablet & desktop, hidden on immersive pages */}
      {!immersive && (
        <AdminSidebar
          basePath={basePath}
          tenant={tenant}
          userName={userName}
          userEmail={userEmail}
          ordersUsagePercent={ordersUsagePercent}
          userTenants={userTenants}
          className="hidden lg:flex"
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleCollapsed}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AdminTopBar notifications={notifications} breadcrumbs={breadcrumbs} />

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-app-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <main
          id="main-content"
          className={cn('flex-1 min-h-0 @container overflow-y-auto', isDevMode && 'pt-6')}
        >
          <div className="max-w-screen-2xl mx-auto h-full">{children}</div>
        </main>

        {(isMobile || isTablet) && !isHome && (
          <AdminBottomNav
            basePath={basePath}
            role={role}
            establishmentType={tenant.establishment_type}
          />
        )}
      </div>
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
      >
        {children}
      </AdminLayoutInner>
    </DeviceProvider>
  );
}
