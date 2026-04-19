import type { AdminUser, Order, Table, TableAssignment, Zone } from '@/types/admin.types';

/**
 * UI-level status derived from backend state (assignments + orders).
 * The backend does not persist a `status` column on tables.
 */
export type ServiceTableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';

/** UI-level server availability derived from is_active + assignments. */
export type ServiceServerStatus = 'online' | 'busy' | 'break';

export type ZoneWithTables = Zone & { tables: Table[] };

export interface ServiceTableVM {
  table: Table;
  zone: Zone | undefined;
  status: ServiceTableStatus;
  assignment: TableAssignment | undefined;
  order: Order | undefined;
  since: string | undefined;
}

export interface ServiceServerVM {
  server: AdminUser;
  status: ServiceServerStatus;
  assignedTables: string[];
}
