import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { ZoneInput } from '@/lib/validations/table-config.schema';

interface ZoneRow {
  id: string;
  name: string;
  prefix: string;
  [key: string]: unknown;
}

interface TableRow {
  id: string;
  table_number: string;
  [key: string]: unknown;
}

interface ZoneWithTables {
  zone: ZoneRow;
  tables: TableRow[];
}

const DEFAULT_CAPACITY = 2;

/**
 * Service for managing restaurant zones and table configurations.
 *
 * Handles bulk creation from onboarding, default configurations,
 * and incremental table additions with auto-numbering.
 */
export function createTableConfigService(supabase: SupabaseClient) {
  return {
    /**
     * Generate a table number from a prefix and index.
     * Pure function: `${prefix}-${index}` (e.g., INT-1, TER-5).
     */
    generateTableNumber(prefix: string, index: number): string {
      return `${prefix}-${index}`;
    },

    /**
     * Bulk create zones and their tables from onboarding data.
     *
     * For each zone: inserts a zone row, then creates N tables
     * with auto-numbered names (e.g., INT-1, INT-2, ...).
     */
    async createZonesAndTables(
      tenantId: string,
      venueId: string,
      zones: ZoneInput[],
    ): Promise<ZoneWithTables[]> {
      const results: ZoneWithTables[] = [];

      for (const zoneInput of zones) {
        // 1. Insert the zone
        const { data: zone, error: zoneError } = await supabase
          .from('zones')
          .insert({
            tenant_id: tenantId,
            venue_id: venueId,
            name: zoneInput.name,
            prefix: zoneInput.prefix,
          })
          .select()
          .single();

        if (zoneError || !zone) {
          throw new ServiceError(
            `Erreur creation zone "${zoneInput.name}": ${zoneError?.message || 'Donnees manquantes'}`,
            'INTERNAL',
            zoneError,
          );
        }

        const typedZone = zone as ZoneRow;

        // 2. Build table rows
        const capacity = zoneInput.defaultCapacity ?? DEFAULT_CAPACITY;
        const tableRows = Array.from({ length: zoneInput.tableCount }, (_, i) => {
          const tableNumber = this.generateTableNumber(zoneInput.prefix, i + 1);
          return {
            tenant_id: tenantId,
            zone_id: typedZone.id,
            table_number: tableNumber,
            display_name: tableNumber,
            capacity,
            is_active: true,
          };
        });

        // 3. Bulk insert tables
        const { data: tables, error: tablesError } = await supabase
          .from('tables')
          .insert(tableRows)
          .select();

        if (tablesError || !tables) {
          throw new ServiceError(
            `Erreur creation tables pour zone "${zoneInput.name}": ${tablesError?.message || 'Donnees manquantes'}`,
            'INTERNAL',
            tablesError,
          );
        }

        const typedTables = (Array.isArray(tables) ? tables : [tables]) as TableRow[];

        results.push({ zone: typedZone, tables: typedTables });
      }

      return results;
    },

    /**
     * Create a default configuration for "skip" mode during onboarding.
     *
     * Creates one zone named "Salle principale" with prefix "TAB"
     * and N tables (TAB-1, TAB-2, ..., TAB-N) with capacity 2.
     */
    async createDefaultConfig(
      tenantId: string,
      venueId: string,
      tableCount: number,
    ): Promise<ZoneWithTables> {
      const defaultZone: ZoneInput = {
        name: 'Salle principale',
        prefix: 'TAB',
        tableCount,
        defaultCapacity: DEFAULT_CAPACITY,
      };

      const results = await this.createZonesAndTables(tenantId, venueId, [defaultZone]);
      return results[0];
    },

    /**
     * Add more tables to an existing zone, continuing the auto-numbering.
     *
     * Finds the max existing table number for the zone prefix,
     * then creates new tables starting from max + 1.
     * E.g., if INT-5 exists, new tables start at INT-6.
     */
    async addTablesToZone(
      tenantId: string,
      zoneId: string,
      prefix: string,
      count: number,
      capacity: number = DEFAULT_CAPACITY,
    ): Promise<TableRow[]> {
      // 1. Find the max existing table number for this prefix
      const { data: maxTable } = await supabase
        .from('tables')
        .select('table_number')
        .eq('zone_id', zoneId)
        .like('table_number', `${prefix}-%`)
        .order('table_number', { ascending: false })
        .limit(1)
        .single();

      let startIndex = 1;

      if (maxTable?.table_number) {
        const parts = (maxTable.table_number as string).split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
          startIndex = lastNum + 1;
        }
      }

      // 2. Build new table rows
      const tableRows = Array.from({ length: count }, (_, i) => {
        const tableNumber = this.generateTableNumber(prefix, startIndex + i);
        return {
          tenant_id: tenantId,
          zone_id: zoneId,
          table_number: tableNumber,
          display_name: tableNumber,
          capacity,
          is_active: true,
        };
      });

      // 3. Bulk insert
      const { data: tables, error: tablesError } = await supabase
        .from('tables')
        .insert(tableRows)
        .select();

      if (tablesError || !tables) {
        throw new ServiceError(
          `Erreur ajout tables: ${tablesError?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          tablesError,
        );
      }

      return (Array.isArray(tables) ? tables : [tables]) as TableRow[];
    },
  };
}
