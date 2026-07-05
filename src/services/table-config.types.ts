import type { Table, Zone } from '@/types/admin.types';
import type { ZoneInput } from '@/lib/validations/table-config.schema';

export interface ZoneRow {
  id: string;
  name: string;
  prefix: string;
  [key: string]: unknown;
}

export interface TableRow {
  id: string;
  table_number: string;
  [key: string]: unknown;
}

export interface ZoneWithTables {
  zone: ZoneRow;
  tables: TableRow[];
}

export const DEFAULT_CAPACITY = 2;

/**
 * Shape returned by the zone-ownership lookup (zone joined to its venue's tenant).
 */
export interface ZoneOwnershipRow {
  venue: { tenant_id: string } | { tenant_id: string }[] | null;
}

/**
 * Shape returned by the table-ownership lookup (table -> zone -> venue's tenant).
 */
export interface TableOwnershipRow {
  zone:
    | { venue: { tenant_id: string } | { tenant_id: string }[] | null }
    | { venue: { tenant_id: string } | { tenant_id: string }[] | null }[]
    | null;
}

/** A `zones` row (select '*') with the embedded venue tenant_id used by the !inner filter. */
export type ZoneWithVenueRef = Zone & { venue: { tenant_id: string } };

/** A `tables` row (select '*') with the embedded zone -> venue tenant_id. */
export type TableWithZoneRef = Table & {
  zone: { venue: { tenant_id: string } };
};

export interface TableConfigService {
  generateTableNumber(prefix: string, index: number): string;
  createZonesAndTables(
    tenantId: string,
    venueId: string,
    zones: ZoneInput[],
  ): Promise<ZoneWithTables[]>;
  createDefaultConfig(
    tenantId: string,
    venueId: string,
    tableCount: number,
  ): Promise<ZoneWithTables>;
  addTablesToZone(
    tenantId: string,
    zoneId: string,
    prefix: string,
    count: number,
    capacity?: number,
  ): Promise<TableRow[]>;
  createZone(
    tenantId: string,
    venueId: string,
    name: string,
    prefix: string,
    displayOrder: number,
  ): Promise<void>;
  updateZoneName(tenantId: string, zoneId: string, name: string): Promise<void>;
  deleteZone(tenantId: string, zoneId: string): Promise<void>;
  insertTables(
    tenantId: string,
    tables: Array<{
      zone_id: string;
      table_number: string;
      display_name: string;
      capacity: number;
      is_active: boolean;
    }>,
  ): Promise<void>;
  toggleTableActive(tenantId: string, tableId: string, isActive: boolean): Promise<void>;
  updateTableCapacity(tenantId: string, tableId: string, capacity: number): Promise<void>;
  updateTableDisplayName(tenantId: string, tableId: string, displayName: string): Promise<void>;
  deleteTable(tenantId: string, tableId: string): Promise<void>;
  listZonesForVenue(tenantId: string, venueId: string): Promise<ZoneWithVenueRef[]>;
  listTablesForZone(tenantId: string, zoneId: string): Promise<TableWithZoneRef[]>;
}
