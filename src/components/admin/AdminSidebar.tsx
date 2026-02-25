'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getRolePermissions } from '@/lib/permissions';
import { getEffectivePermissions } from '@/lib/permissions';
import { useSidebar } from '@/contexts/SidebarContext';
import { useRolePermissions } from '@/hooks/queries/useRolePermissions';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNav } from './sidebar/SidebarNav';
import { SidebarFooter } from './sidebar/SidebarFooter';
import type { AdminRole, AdminUser } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface AdminSidebarProps {
  tenant: {
    id?: string;
    name: string;
    slug: string;
    logo_url?: string;
    primary_color?: string;
  };
  adminUser?: {
    name?: string;
    role: string;
    custom_permissions?: Record<string, boolean> | null;
  };
  role?: AdminRole;
  className?: string;
}

// ─── Component ──────────────────────────────────────────

export function AdminSidebar({ tenant, adminUser, role, className }: AdminSidebarProps) {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const t = useTranslations('sidebar');
  const { isCollapsed, toggleCollapsed } = useSidebar();

  // Mobile sidebar: open only if toggled for current pathname
  const isOpen = openForPath === pathname;
  const toggleSidebar = () => setOpenForPath(isOpen ? null : pathname);

  const basePath = `/sites/${tenant.slug}/admin`;

  // ─── Role labels ──────────────────────────────────────

  const roleLabels: Record<string, string> = {
    owner: t('roleOwner'),
    admin: t('roleAdmin'),
    manager: t('roleManager'),
    chef: t('roleKitchen'),
    waiter: t('roleServer'),
    cashier: t('roleStaff'),
  };

  const roleLabel = adminUser ? roleLabels[adminUser.role] || adminUser.role : 'Admin';

  // ─── Legacy permissions ───────────────────────────────

  const permissions = role ? getRolePermissions(role) : null;

  // ─── 3-level permission overrides ─────────────────────

  const roleOverrides = useRolePermissions(tenant.id, role);

  // Build effective permission map (new 3-level system)
  const effectivePerms = useMemo(() => {
    if (!role || !adminUser) return null;
    const fakeAdminUser: AdminUser = {
      id: '',
      user_id: '',
      tenant_id: tenant.id || '',
      email: '',
      role: role,
      is_active: true,
      created_at: '',
      custom_permissions: adminUser.custom_permissions || null,
    };
    return getEffectivePermissions(fakeAdminUser, roleOverrides);
  }, [role, adminUser, tenant.id, roleOverrides]);

  // ─── Render ───────────────────────────────────────────

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden bg-white border border-neutral-200 min-w-[44px] min-h-[44px] touch-manipulation"
        onClick={toggleSidebar}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setOpenForPath(null)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 h-[100dvh] bg-white border-r border-neutral-100 z-40 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0',
          isCollapsed ? 'w-16' : 'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
      >
        <SidebarHeader
          basePath={basePath}
          tenant={tenant}
          roleLabel={roleLabel}
          isCollapsed={isCollapsed}
        />

        <SidebarNav
          basePath={basePath}
          isCollapsed={isCollapsed}
          primaryColor={tenant.primary_color}
          role={role}
          permissions={permissions}
          effectivePerms={effectivePerms}
          onToggleCollapsed={toggleCollapsed}
        />

        <SidebarFooter
          basePath={basePath}
          isCollapsed={isCollapsed}
          adminUser={adminUser}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>
    </>
  );
}
