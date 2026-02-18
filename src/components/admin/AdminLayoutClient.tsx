'use client';

import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';

// ─── Inner Layout (consumes sidebar context) ────────────

interface AdminLayoutInnerProps {
  children: React.ReactNode;
  isDevMode: boolean;
}

function AdminLayoutInner({ children, isDevMode }: AdminLayoutInnerProps) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={cn(
        'min-h-screen transition-[margin-left] duration-300 ease-in-out',
        isCollapsed ? 'lg:ml-16' : 'lg:ml-64',
        isDevMode && 'pt-6',
      )}
    >
      {children}
    </main>
  );
}

// ─── Wrapper (provides sidebar context) ─────────────────

interface AdminLayoutClientProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  isDevMode: boolean;
}

export function AdminLayoutClient({ sidebar, children, isDevMode }: AdminLayoutClientProps) {
  return (
    <SidebarProvider>
      {sidebar}
      <AdminLayoutInner isDevMode={isDevMode}>{children}</AdminLayoutInner>
    </SidebarProvider>
  );
}
