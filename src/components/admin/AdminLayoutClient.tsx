'use client';

import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { DeviceProvider, useDeviceContext } from '@/contexts/DeviceContext';
import { AdminBottomNav } from './AdminBottomNav';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@/types/admin.types';

// ─── Inner Layout (consumes sidebar + device context) ────

interface AdminLayoutInnerProps {
  children: React.ReactNode;
  isDevMode: boolean;
  basePath: string;
  role: AdminRole;
  primaryColor?: string;
  sidebar: React.ReactNode;
}

function AdminLayoutInner({
  children,
  isDevMode,
  basePath,
  role,
  primaryColor,
  sidebar,
}: AdminLayoutInnerProps) {
  const { isCollapsed } = useSidebar();
  const { isMobile, isTablet } = useDeviceContext();

  // On mobile: no sidebar margin, bottom padding for bottom nav
  // On tablet: always collapsed sidebar (w-16), so ml-16
  // On desktop: respect collapse state (ml-16 or ml-64)
  const marginClass = isMobile
    ? '' // no margin — sidebar is hidden
    : isTablet
      ? 'lg:ml-16' // tablet: always collapsed
      : isCollapsed
        ? 'lg:ml-16'
        : 'lg:ml-64';

  return (
    <>
      {/* Sidebar: hidden on mobile (drawer only), visible on tablet/desktop */}
      {sidebar}

      <main
        className={cn(
          'h-[100dvh] overflow-y-auto transition-[margin-left] duration-300 ease-in-out',
          marginClass,
          isMobile && 'pb-16', // space for bottom nav
          isDevMode && 'pt-6',
        )}
      >
        {children}
      </main>

      {/* Bottom navigation for mobile only */}
      {isMobile && <AdminBottomNav basePath={basePath} role={role} primaryColor={primaryColor} />}
    </>
  );
}

// ─── Wrapper (provides sidebar + device context) ─────────

interface AdminLayoutClientProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  isDevMode: boolean;
  basePath: string;
  role: AdminRole;
  primaryColor?: string;
}

export function AdminLayoutClient({
  sidebar,
  children,
  isDevMode,
  basePath,
  role,
  primaryColor,
}: AdminLayoutClientProps) {
  return (
    <DeviceProvider>
      <SidebarProvider>
        <AdminLayoutInner
          isDevMode={isDevMode}
          basePath={basePath}
          role={role}
          primaryColor={primaryColor}
          sidebar={sidebar}
        >
          {children}
        </AdminLayoutInner>
      </SidebarProvider>
    </DeviceProvider>
  );
}
