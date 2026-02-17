'use client';

import { createContext, useMemo } from 'react';
import { getRolePermissions, type RolePermissions } from '@/lib/permissions';
import type { AdminRole } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

export interface PermissionsContextValue {
  role: AdminRole;
  permissions: RolePermissions;
  can: (key: keyof RolePermissions) => boolean;
}

// ─── Context ────────────────────────────────────────────

export const PermissionsContext = createContext<PermissionsContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

interface PermissionsProviderProps {
  role: AdminRole;
  children: React.ReactNode;
}

export function PermissionsProvider({ role, children }: PermissionsProviderProps) {
  const value = useMemo(() => {
    const permissions = getRolePermissions(role);
    return {
      role,
      permissions,
      can: (key: keyof RolePermissions) => {
        const val = permissions[key];
        return typeof val === 'boolean' ? val : !!val;
      },
    };
  }, [role]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
