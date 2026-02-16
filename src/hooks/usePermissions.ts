'use client';

import { useContext } from 'react';
import { PermissionsContext } from '@/contexts/PermissionsContext';
import type { RolePermissions } from '@/lib/permissions';
import type { AdminRole } from '@/types/admin.types';

interface UsePermissionsReturn {
  role: AdminRole;
  permissions: RolePermissions;
  can: (key: keyof RolePermissions) => boolean;
}

export function usePermissions(): UsePermissionsReturn {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
