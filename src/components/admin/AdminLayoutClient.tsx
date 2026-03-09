'use client';

import { DeviceProvider, useDeviceContext } from '@/contexts/DeviceContext';
import { AdminTopBar } from './AdminTopBar';
import { AdminBottomNav } from './AdminBottomNav';
import { AdminSidebar } from './AdminSidebar';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { isAdminHome, isImmersivePage } from '@/lib/constants';
import type { AdminRole } from '@/types/admin.types';

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
  };
  notifications?: React.ReactNode;
}

function AdminLayoutInner({
  children,
  isDevMode,
  basePath,
  role,
  tenant,
  notifications,
}: AdminLayoutInnerProps) {
  const { isMobile } = useDeviceContext();
  const pathname = usePathname();
  const isHome = isAdminHome(pathname, basePath);
  const immersive = isImmersivePage(pathname);

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-app-bg transition-colors duration-200">
      <AdminTopBar tenant={tenant} basePath={basePath} notifications={notifications} />

      <div className="flex-1 flex min-h-0">
        {/* Sidebar — desktop only, hidden on immersive pages */}
        {!immersive && (
          <AdminSidebar basePath={basePath} tenant={tenant} className="hidden md:flex" />
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-app-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
          >
            Skip to content
          </a>

          <main
            id="main-content"
            className={cn('flex-1 min-h-0', 'overflow-hidden', isDevMode && 'pt-6')}
          >
            {children}
          </main>

          {isMobile && !isHome && <AdminBottomNav basePath={basePath} role={role} />}
        </div>
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
  };
  notifications?: React.ReactNode;
}

export function AdminLayoutClient({
  children,
  isDevMode,
  basePath,
  role,
  tenant,
  notifications,
}: AdminLayoutClientProps) {
  return (
    <DeviceProvider>
      <AdminLayoutInner
        isDevMode={isDevMode}
        basePath={basePath}
        role={role}
        tenant={tenant}
        notifications={notifications}
      >
        {children}
      </AdminLayoutInner>
    </DeviceProvider>
  );
}
