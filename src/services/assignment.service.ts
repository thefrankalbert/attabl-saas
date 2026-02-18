import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { TableAssignment, AdminUser } from '@/types/admin.types';

export function createAssignmentService(supabase: SupabaseClient) {
  return {
    async assignServerToTable(
      tenantId: string,
      tableId: string,
      serverId: string,
    ): Promise<TableAssignment> {
      const { data: server, error: serverErr } = await supabase
        .from('admin_users')
        .select('id, role')
        .eq('id', serverId)
        .eq('tenant_id', tenantId)
        .single();

      if (serverErr || !server) {
        throw new ServiceError('Serveur introuvable', 'NOT_FOUND');
      }

      const { data, error } = await supabase
        .from('table_assignments')
        .insert({
          tenant_id: tenantId,
          table_id: tableId,
          server_id: serverId,
        })
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number)',
        )
        .single();

      if (error) throw new ServiceError("Erreur lors de l'assignation", 'INTERNAL');
      return data as TableAssignment;
    },

    async releaseAssignment(assignmentId: string): Promise<void> {
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', assignmentId)
        .is('ended_at', null);

      if (error) throw new ServiceError('Erreur lors de la liberation', 'INTERNAL');
    },

    async releaseAllForServer(tenantId: string, serverId: string): Promise<void> {
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('server_id', serverId)
        .is('ended_at', null);

      if (error) throw new ServiceError('Erreur lors de la liberation', 'INTERNAL');
    },

    async getActiveServerForTable(tenantId: string, tableId: string): Promise<AdminUser | null> {
      const { data, error } = await supabase
        .from('table_assignments')
        .select('server:admin_users(id, full_name, role)')
        .eq('tenant_id', tenantId)
        .eq('table_id', tableId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data.server as unknown as AdminUser;
    },

    async getActiveAssignments(tenantId: string): Promise<TableAssignment[]> {
      const { data, error } = await supabase
        .from('table_assignments')
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number, zone_id)',
        )
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

      if (error) throw new ServiceError('Erreur de chargement', 'INTERNAL');
      return (data as TableAssignment[]) ?? [];
    },

    async claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('orders')
        .update({ server_id: serverId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) throw new ServiceError('Erreur lors du claim', 'INTERNAL');
    },
  };
}
