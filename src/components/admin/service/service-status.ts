import type { AdminUser, Order, Table, TableAssignment, Zone } from '@/types/admin.types';
import type {
  ServiceServerStatus,
  ServiceServerVM,
  ServiceTableStatus,
  ServiceTableVM,
} from './service.types';

/**
 * Derive a table's service status from backend state.
 * The backend has no `status` column, so this is computed client-side.
 *
 * - `occupied`: an active assignment OR an active order exists
 * - `free`: otherwise
 *
 * `reserved` and `cleaning` are reserved for future backend support and
 * currently never returned.
 */
export function deriveTableStatus(
  assignment: TableAssignment | undefined,
  order: Order | undefined,
): ServiceTableStatus {
  if (assignment || (order && order.status !== 'delivered' && order.status !== 'cancelled')) {
    return 'occupied';
  }
  return 'free';
}

export function deriveServerStatus(server: AdminUser, hasAssignment: boolean): ServiceServerStatus {
  if (!server.is_active) return 'break';
  if (hasAssignment) return 'busy';
  return 'online';
}

export function buildTableVMs(
  zones: Array<Zone & { tables: Table[] }>,
  assignments: TableAssignment[],
  orders: Order[],
): ServiceTableVM[] {
  const assignmentByTable = new Map(assignments.map((a) => [a.table_id, a]));
  const orderByTable = new Map<string, Order>();
  for (const o of orders) {
    if (o.status === 'delivered' || o.status === 'cancelled') continue;
    if (o.table_id) orderByTable.set(o.table_id, o);
  }

  const out: ServiceTableVM[] = [];
  for (const zone of zones) {
    for (const table of zone.tables) {
      if (!table.is_active) continue;
      const assignment = assignmentByTable.get(table.id);
      const order = orderByTable.get(table.id);
      out.push({
        table,
        zone,
        assignment,
        order,
        status: deriveTableStatus(assignment, order),
        since: assignment?.started_at ?? order?.created_at ?? undefined,
      });
    }
  }
  return out;
}

export function buildServerVMs(
  servers: AdminUser[],
  assignments: TableAssignment[],
  tables: Table[],
): ServiceServerVM[] {
  const tableByIdToNumber = new Map(tables.map((t) => [t.id, t.display_name || t.table_number]));
  const tablesByServer = new Map<string, string[]>();
  for (const a of assignments) {
    const label = tableByIdToNumber.get(a.table_id);
    if (!label) continue;
    const arr = tablesByServer.get(a.server_id) ?? [];
    arr.push(label);
    tablesByServer.set(a.server_id, arr);
  }

  return servers.map((server) => {
    const assignedTables = tablesByServer.get(server.id) ?? [];
    return {
      server,
      status: deriveServerStatus(server, assignedTables.length > 0),
      assignedTables,
    };
  });
}

export function formatInitials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTimeHHMM(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getElapsedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}
