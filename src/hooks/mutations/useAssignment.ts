'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useAssignServer(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, serverId }: { tableId: string; serverId: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('table_assignments')
        .insert({ tenant_id: tenantId, table_id: tableId, server_id: serverId })
        .select('*, server:admin_users(id, full_name, role), table:tables(id, display_name)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useReleaseAssignment(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
  });
}

export function useClaimOrder(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, serverId }: { orderId: string; serverId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('orders')
        .update({ server_id: serverId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
  });
}
