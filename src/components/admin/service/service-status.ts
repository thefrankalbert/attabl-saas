import type { AdminUser, Table, TableAssignment, Zone } from '@/types/admin.types';
import type { OpenTableSession } from '@/services/service-manager.service';
import type {
  ServiceServerStatus,
  ServiceServerVM,
  ServiceTableStatus,
  ServiceTableVM,
} from './service.types';

/**
 * Derive a table's service status from backend state.
 * The backend has no `status` column, so this is computed client-side from the
 * SAME canonical signal the tenant dashboard uses: an open `table_sessions` row.
 * A dine-in order (POS or storefront) opens the session; settling it closes the
 * session. A server assignment also counts as occupied.
 *
 * - `occupied`: an active assignment OR an open table session exists
 * - `free`: otherwise
 *
 * `reserved` and `cleaning` are reserved for future backend support and
 * currently never returned.
 */
function deriveTableStatus(
  assignment: TableAssignment | undefined,
  hasOpenSession: boolean,
): ServiceTableStatus {
  if (assignment || hasOpenSession) {
    return 'occupied';
  }
  return 'free';
}

function deriveServerStatus(server: AdminUser, hasAssignment: boolean): ServiceServerStatus {
  if (!server.is_active) return 'break';
  if (hasAssignment) return 'busy';
  return 'online';
}

export function buildTableVMs(
  zones: Array<Zone & { tables: Table[] }>,
  assignments: TableAssignment[],
  openSessions: OpenTableSession[],
): ServiceTableVM[] {
  const assignmentByTable = new Map(assignments.map((a) => [a.table_id, a]));

  // A session carries one table_number (text). A table may be referenced by its
  // table_number or its display_name, so below we look up the session under both.
  const sessionOpenedByLabel = new Map<string, string>();
  for (const s of openSessions) {
    if (s.table_number) sessionOpenedByLabel.set(s.table_number, s.opened_at);
  }

  const out: ServiceTableVM[] = [];
  for (const zone of zones) {
    for (const table of zone.tables) {
      if (!table.is_active) continue;
      const assignment = assignmentByTable.get(table.id);
      const sessionOpenedAt =
        sessionOpenedByLabel.get(table.table_number) ??
        (table.display_name ? sessionOpenedByLabel.get(table.display_name) : undefined);
      out.push({
        table,
        zone,
        assignment,
        status: deriveTableStatus(assignment, sessionOpenedAt !== undefined),
        since: assignment?.started_at ?? sessionOpenedAt ?? undefined,
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
