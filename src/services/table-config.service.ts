import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { ZoneInput } from '@/lib/validations/table-config.schema';
import {
  DEFAULT_CAPACITY,
  type ZoneRow,
  type TableRow,
  type ZoneWithTables,
  type ZoneWithVenueRef,
  type TableWithZoneRef,
  type TableConfigService,
} from './table-config.types';
import { createTableConfigGuards } from './table-config.guards';

/**
 * Service for managing restaurant zones and table configurations.
 * Handles bulk creation from onboarding, default configurations,
 * and incremental table additions with auto-numbering.
 */
export function createTableConfigService(supabase: SupabaseClient): TableConfigService {
  const { assertVenueOwnedByTenant, assertZoneOwnedByTenant, assertTableOwnedByTenant } =
    createTableConfigGuards(supabase);

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
      // 1. Bulk-insert all zones in a single query
      const zoneInserts = zones.map((z) => ({
        tenant_id: tenantId,
        venue_id: venueId,
        name: z.name,
        prefix: z.prefix,
      }));

      const { data: insertedZones, error: zonesError } = await supabase
        .from('zones')
        .insert(zoneInserts)
        .select();

      if (zonesError || !insertedZones) {
        throw new ServiceError(
          `Erreur creation zones: ${zonesError?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          zonesError,
        );
      }

      const typedZones = insertedZones as ZoneRow[];

      // 2. Build all table rows for all zones in one batch
      const allTableRows = typedZones.flatMap((zone, i) => {
        const zoneInput = zones[i];
        const capacity = zoneInput.defaultCapacity ?? DEFAULT_CAPACITY;
        return Array.from({ length: zoneInput.tableCount }, (_, j) => {
          const tableNumber = this.generateTableNumber(zoneInput.prefix, j + 1);
          return {
            tenant_id: tenantId,
            zone_id: zone.id,
            table_number: tableNumber,
            display_name: tableNumber,
            capacity,
            is_active: true,
          };
        });
      });

      // 3. Bulk-insert all tables in a single query
      const { data: allTables, error: tablesError } = await supabase
        .from('tables')
        .insert(allTableRows)
        .select();

      if (tablesError || !allTables) {
        throw new ServiceError(
          `Erreur creation tables: ${tablesError?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          tablesError,
        );
      }

      const typedTables = (Array.isArray(allTables) ? allTables : [allTables]) as TableRow[];

      // 4. Group tables by zone_id for the return value
      return typedZones.map((zone) => ({
        zone,
        tables: typedTables.filter((t) => t.zone_id === zone.id),
      }));
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
      // 0. Ownership guard: zone must belong to the verified tenant
      await assertZoneOwnedByTenant(tenantId, zoneId);

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

    /**
     * Create a single zone for a venue.
     * Guarded: the venue must belong to the verified tenant.
     */
    async createZone(
      tenantId: string,
      venueId: string,
      name: string,
      prefix: string,
      displayOrder: number,
    ): Promise<void> {
      await assertVenueOwnedByTenant(tenantId, venueId);

      const { error } = await supabase.from('zones').insert([
        {
          tenant_id: tenantId,
          venue_id: venueId,
          name,
          prefix: prefix.toUpperCase(),
          display_order: displayOrder,
        },
      ]);

      if (error) {
        throw new ServiceError(`Erreur creation zone: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Update a zone's name.
     * Guarded: the zone must belong to the verified tenant.
     */
    async updateZoneName(tenantId: string, zoneId: string, name: string): Promise<void> {
      await assertZoneOwnedByTenant(tenantId, zoneId);

      const { error } = await supabase.from('zones').update({ name }).eq('id', zoneId);

      if (error) {
        throw new ServiceError(`Erreur mise a jour zone: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Delete a zone by ID.
     * Guarded: the zone must belong to the verified tenant.
     */
    async deleteZone(tenantId: string, zoneId: string): Promise<void> {
      await assertZoneOwnedByTenant(tenantId, zoneId);

      const { error } = await supabase.from('zones').delete().eq('id', zoneId);

      if (error) {
        throw new ServiceError(`Erreur suppression zone: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Insert multiple tables into one or more zones.
     * Guarded: every target zone must belong to the verified tenant, so a
     * foreign zone_id in the batch is rejected before any write.
     */
    async insertTables(
      tenantId: string,
      tables: Array<{
        zone_id: string;
        table_number: string;
        display_name: string;
        capacity: number;
        is_active: boolean;
      }>,
    ): Promise<void> {
      const uniqueZoneIds = Array.from(new Set(tables.map((t) => t.zone_id)));

      const { data: ownedZones, error: zonesError } = await supabase
        .from('zones')
        .select('id, venue:venues!inner(tenant_id)')
        .in('id', uniqueZoneIds)
        .eq('venues.tenant_id', tenantId);

      if (zonesError) {
        throw new ServiceError(
          `Erreur verification zones: ${zonesError.message}`,
          'INTERNAL',
          zonesError,
        );
      }

      const ownedZoneIds = new Set(((ownedZones as Array<{ id: string }>) ?? []).map((z) => z.id));
      const hasForeignZone = uniqueZoneIds.some((id) => !ownedZoneIds.has(id));
      if (hasForeignZone) {
        throw new ServiceError('Zone introuvable pour ce tenant', 'NOT_FOUND');
      }

      const { error } = await supabase.from('tables').insert(tables);

      if (error) {
        throw new ServiceError(`Erreur creation tables: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_active flag on a table.
     * Guarded: the table must belong to the verified tenant.
     */
    async toggleTableActive(tenantId: string, tableId: string, isActive: boolean): Promise<void> {
      await assertTableOwnedByTenant(tenantId, tableId);

      const { error } = await supabase
        .from('tables')
        .update({ is_active: isActive })
        .eq('id', tableId);

      if (error) {
        throw new ServiceError(`Erreur mise a jour table: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Update a table's capacity.
     * Guarded: the table must belong to the verified tenant.
     */
    async updateTableCapacity(tenantId: string, tableId: string, capacity: number): Promise<void> {
      await assertTableOwnedByTenant(tenantId, tableId);

      const { error } = await supabase.from('tables').update({ capacity }).eq('id', tableId);

      if (error) {
        throw new ServiceError(`Erreur mise a jour capacite: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Update a table's display name.
     * Guarded: the table must belong to the verified tenant.
     */
    async updateTableDisplayName(
      tenantId: string,
      tableId: string,
      displayName: string,
    ): Promise<void> {
      await assertTableOwnedByTenant(tenantId, tableId);

      const { error } = await supabase
        .from('tables')
        .update({ display_name: displayName })
        .eq('id', tableId);

      if (error) {
        throw new ServiceError(`Erreur mise a jour nom table: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * Delete a table by ID.
     * Guarded: the table must belong to the verified tenant.
     */
    async deleteTable(tenantId: string, tableId: string): Promise<void> {
      await assertTableOwnedByTenant(tenantId, tableId);

      const { error } = await supabase.from('tables').delete().eq('id', tableId);

      if (error) {
        throw new ServiceError(`Erreur suppression table: ${error.message}`, 'INTERNAL', error);
      }
    },

    /**
     * List all zones for a venue (ordered by display_order).
     * Filters by venue's tenant to enforce multi-tenant isolation even if
     * a venueId leaks or is guessed (defense-in-depth beyond RLS).
     */
    async listZonesForVenue(tenantId: string, venueId: string): Promise<ZoneWithVenueRef[]> {
      const { data, error } = await supabase
        .from('zones')
        .select('*, venue:venues!inner(tenant_id)')
        .eq('venue_id', venueId)
        .eq('venues.tenant_id', tenantId)
        .order('display_order');

      if (error) {
        throw new ServiceError(`Erreur chargement zones: ${error.message}`, 'INTERNAL', error);
      }
      return (data as ZoneWithVenueRef[]) || [];
    },

    /**
     * List all tables for a zone (ordered by table_number).
     * Filters by the zone's venue's tenant for multi-tenant isolation.
     */
    async listTablesForZone(tenantId: string, zoneId: string): Promise<TableWithZoneRef[]> {
      const { data, error } = await supabase
        .from('tables')
        .select('*, zone:zones!inner(venue:venues!inner(tenant_id))')
        .eq('zone_id', zoneId)
        .eq('zones.venues.tenant_id', tenantId)
        .order('table_number');

      if (error) {
        throw new ServiceError(`Erreur chargement tables: ${error.message}`, 'INTERNAL', error);
      }
      return (data as TableWithZoneRef[]) || [];
    },
  };
}
