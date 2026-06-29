import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { TableAssignment, AdminUser } from '@/types/admin.types';

export interface AssignmentService {
  assignServerToTable(
    tenantId: string,
    tableId: string,
    serverId: string,
  ): Promise<TableAssignment>;
  releaseAssignment(assignmentId: string, tenantId: string): Promise<void>;
  releaseAllForServer(tenantId: string, serverId: string): Promise<void>;
  getActiveServerForTable(tenantId: string, tableId: string): Promise<AdminUser | null>;
  getActiveAssignments(
    tenantId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<{ assignments: TableAssignment[]; total: number }>;
  claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void>;
}

export function createAssignmentService(supabase: SupabaseClient): AssignmentService {
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

    async releaseAssignment(assignmentId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', assignmentId)
        .eq('tenant_id', tenantId)
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
      // Supabase join type gap
      return data.server as unknown as AdminUser;
    },

    async getActiveAssignments(
      tenantId: string,
      options?: { page?: number; pageSize?: number },
    ): Promise<{ assignments: TableAssignment[]; total: number }> {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 50;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('table_assignments')
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number, zone_id)',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .range(from, to);

      if (error) throw new ServiceError('Erreur de chargement', 'INTERNAL');
      return {
        assignments: (data as TableAssignment[]) ?? [],
        total: count ?? 0,
      };
    },

    async claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void> {
      // Atomic first-claim-wins: only claim an order that is unassigned, or
      // re-claim one already owned by this same server (idempotent). Without the
      // server_id guard two waiters claiming at once would silently steal each
      // other's order (last write wins).
      const { data, error } = await supabase
        .from('orders')
        .update({ server_id: serverId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .or(`server_id.is.null,server_id.eq.${serverId}`)
        .select('id');

      if (error) throw new ServiceError('Erreur lors du claim', 'INTERNAL');
      if (!Array.isArray(data) || data.length === 0) {
        throw new ServiceError('Cette commande est deja prise en charge', 'VALIDATION');
      }
    },
  };
}
