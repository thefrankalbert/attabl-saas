import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { TableAssignment } from '@/types/admin.types';

export interface AssignmentService {
  assignServerToTable(
    tenantId: string,
    tableId: string,
    serverId: string,
  ): Promise<TableAssignment>;
  releaseAssignment(assignmentId: string, tenantId: string): Promise<void>;
  releaseAllForServer(tenantId: string, serverId: string): Promise<void>;
  assignIfFree(tenantId: string, tableId: string, serverId: string): Promise<boolean>;
  claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void>;
}

export function createAssignmentService(supabase: SupabaseClient): AssignmentService {
  const service: AssignmentService = {
    async assignServerToTable(
      tenantId: string,
      tableId: string,
      serverId: string,
    ): Promise<TableAssignment> {
      const { data: server, error: serverErr } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', serverId)
        .eq('tenant_id', tenantId)
        .single();

      if (serverErr || !server) {
        throw new ServiceError('Serveur introuvable', 'NOT_FOUND');
      }

      // Verify the table belongs to this tenant too: without this an
      // member allowed to assign could pass another tenant's table_id and create an
      // assignment row referencing a foreign table (cross-tenant write).
      const { data: table, error: tableErr } = await supabase
        .from('tables')
        .select('id')
        .eq('id', tableId)
        .eq('tenant_id', tenantId)
        .single();

      if (tableErr || !table) {
        throw new ServiceError('Table introuvable', 'NOT_FOUND');
      }

      const { data, error } = await supabase
        .from('table_assignments')
        .insert({
          tenant_id: tenantId,
          table_id: tableId,
          server_id: serverId,
        })
        .select(
          '*, server:admin_users(id, full_name, postes), table:tables(id, display_name, table_number)',
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

    /**
     * Owner decision 2026-11-14: the waiter who takes a dine-in order at the POS
     * becomes that table's server, unless the table already has one. Returns
     * whether an assignment was created. Not atomic: two waiters ordering for
     * the same free table in the same instant could both land. A unique index
     * on active assignments is NOT the fix: assignServerToTable never ends the
     * previous row, so several active servers per table are a supported state
     * today (the screens show the latest). Worst case of the race = that state.
     */
    async assignIfFree(tenantId: string, tableId: string, serverId: string): Promise<boolean> {
      // A read error must not count as "free": that would stack a second
      // server on a table during a DB hiccup.
      const { data: current, error } = await supabase
        .from('table_assignments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('table_id', tableId)
        .is('ended_at', null)
        .limit(1)
        .maybeSingle();
      if (error) throw new ServiceError('Lecture des assignations impossible', 'INTERNAL', error);
      if (current) return false;
      await service.assignServerToTable(tenantId, tableId, serverId);
      return true;
    },

    async claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void> {
      // Atomic first-claim-wins: only claim an order that is unassigned, or
      // re-claim one already owned by this same server (idempotent). Without the
      // server_id guard two waiters claiming at once would silently steal each
      // other's order (last write wins).
      //
      // `count`, not `.select()`: PostgREST rejects an `or` filter combined with
      // returning the updated rows (42703 "column orders.server_id does not
      // exist", measured 2026-11-08 on PostgREST v14.3), so the claim ALWAYS
      // failed. The row count keeps the single atomic statement.
      const { count, error } = await supabase
        .from('orders')
        .update({ server_id: serverId }, { count: 'exact' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        // B9: une commande annulee ou deja reglee (payee, offerte, remboursee)
        // ne se prend plus en charge: le rapport de performance attribue le
        // chiffre par server_id. Meme UPDATE, donc toujours atomique.
        .neq('status', 'cancelled')
        .in('payment_status', ['pending', 'partial'])
        .or(`server_id.is.null,server_id.eq.${serverId}`);

      if (error) throw new ServiceError('Erreur lors du claim', 'INTERNAL');
      if (!count) {
        // Race lost (another server owns it) or the order is closed (cancelled
        // or settled). CONFLICT -> HTTP 409, not VALIDATION/400 (bad input).
        throw new ServiceError(
          'Cette commande ne peut pas etre prise en charge: un autre serveur la suit deja, ou elle est reglee ou annulee.',
          'CONFLICT',
        );
      }
    },
  };
  return service;
}
