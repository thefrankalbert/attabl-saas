'use client';

import { SidebarProvider } from '@/contexts/SidebarContext';
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
  const { isMobile } = useDeviceContext();

  return (
    <div className="h-dvh overflow-hidden flex flex-col lg:flex-row bg-neutral-100">
      {/* Sidebar: overlay drawer on mobile, in-flow on lg+ */}
      {sidebar}

      {/* Content zone: fills remaining space */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <main className={cn('flex-1 overflow-y-auto', isDevMode && 'pt-6')}>{children}</main>

        {/* Bottom navigation: in-flow at bottom on mobile */}
        {isMobile && <AdminBottomNav basePath={basePath} role={role} primaryColor={primaryColor} />}
      </div>
    </div>
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
