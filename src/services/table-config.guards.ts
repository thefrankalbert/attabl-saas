import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { ZoneOwnershipRow, TableOwnershipRow } from './table-config.types';

/**
 * Normalize the tenant_id out of a possibly-array embedded relation.
 * Supabase typings allow embedded relations to be an object or an array.
 */
export function extractTenantId(
  venue: { tenant_id: string } | { tenant_id: string }[] | null | undefined,
): string | null {
  if (!venue) return null;
  if (Array.isArray(venue)) {
    return venue.length > 0 ? venue[0].tenant_id : null;
  }
  return venue.tenant_id;
}

export interface TableConfigGuards {
  assertVenueOwnedByTenant(tenantId: string, venueId: string): Promise<void>;
  assertZoneOwnedByTenant(tenantId: string, zoneId: string): Promise<void>;
  assertTableOwnedByTenant(tenantId: string, tableId: string): Promise<void>;
}

/**
 * Ownership guards for zones/tables/venues. Each guard confirms a target row
 * resolves to the verified tenant, throwing NOT_FOUND on mismatch so a foreign
 * id can never be used as a write target (defense beyond RLS).
 */
export function createTableConfigGuards(supabase: SupabaseClient): TableConfigGuards {
  return {
    /**
     * Ownership guard: confirm a venue belongs to the verified tenant.
     * Throws NOT_FOUND if the venue does not resolve to tenantId, so a foreign
     * venueId can never be used as a write target (defense beyond RLS).
     */
    async assertVenueOwnedByTenant(tenantId: string, venueId: string): Promise<void> {
      const { data, error } = await supabase
        .from('venues')
        .select('id')
        .eq('id', venueId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        throw new ServiceError(`Erreur verification venue: ${error.message}`, 'INTERNAL', error);
      }
      if (!data) {
        throw new ServiceError('Venue introuvable pour ce tenant', 'NOT_FOUND');
      }
    },

    /**
     * Ownership guard: confirm a zone belongs to the verified tenant via
     * zone.venue_id -> venues.tenant_id. Throws NOT_FOUND on mismatch so a
     * foreign zoneId can never be used as a write target.
     */
    async assertZoneOwnedByTenant(tenantId: string, zoneId: string): Promise<void> {
      const { data, error } = await supabase
        .from('zones')
        .select('venue:venues!inner(tenant_id)')
        .eq('id', zoneId)
        .maybeSingle<ZoneOwnershipRow>();

      if (error) {
        throw new ServiceError(`Erreur verification zone: ${error.message}`, 'INTERNAL', error);
      }
      if (!data || extractTenantId(data.venue) !== tenantId) {
        throw new ServiceError('Zone introuvable pour ce tenant', 'NOT_FOUND');
      }
    },

    /**
     * Ownership guard: confirm a table belongs to the verified tenant via
     * table.zone_id -> zones -> venues.tenant_id. Throws NOT_FOUND on mismatch
     * so a foreign tableId can never be used as a write target.
     */
    async assertTableOwnedByTenant(tenantId: string, tableId: string): Promise<void> {
      const { data, error } = await supabase
        .from('tables')
        .select('zone:zones!inner(venue:venues!inner(tenant_id))')
        .eq('id', tableId)
        .maybeSingle<TableOwnershipRow>();

      if (error) {
        throw new ServiceError(`Erreur verification table: ${error.message}`, 'INTERNAL', error);
      }

      const zone = data?.zone;
      const venue = Array.isArray(zone) ? zone[0]?.venue : zone?.venue;
      if (!data || extractTenantId(venue) !== tenantId) {
        throw new ServiceError('Table introuvable pour ce tenant', 'NOT_FOUND');
      }
    },
  };
}
