'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TableAssignment } from '@/types/admin.types';

export function useAssignments(tenantId: string) {
  return useQuery<TableAssignment[]>({
    queryKey: ['assignments', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('table_assignments')
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number, zone_id)',
        )
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data as TableAssignment[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
