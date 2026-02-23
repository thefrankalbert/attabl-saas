'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RolePermissions } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';

/**
 * Fetch role_permissions overrides for the 3-level permission system.
 * Owner role is skipped (always has full permissions).
 *
 * Uses a simple useEffect + useState instead of React Query because
 * this data rarely changes and the sidebar lives outside QueryProvider.
 */
export function useRolePermissions(
  tenantId: string | undefined,
  role: AdminRole | undefined,
): RolePermissions | null {
  const [roleOverrides, setRoleOverrides] = useState<RolePermissions | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!tenantId || !role || role === 'owner' || hasFetched.current) return;
    hasFetched.current = true;

    const supabase = createClient();
    supabase
      .from('role_permissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('role', role)
      .single()
      .then(({ data }) => {
        if (data) {
          setRoleOverrides(data as RolePermissions);
        }
      });
  }, [tenantId, role]);

  return roleOverrides;
}
