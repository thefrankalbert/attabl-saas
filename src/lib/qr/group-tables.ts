import type { Table, Zone } from '@/types/admin.types';

/**
 * Group tables by their zone, preserving zone order and dropping empty zones.
 * Shared by the QR assignment panel and the batch export preview so the two
 * stay in sync (was duplicated in both).
 */
export function groupTablesByZone(
  zones: Zone[],
  tables: Table[],
): { zone: Zone; tables: Table[] }[] {
  const grouped: Record<string, { zone: Zone; tables: Table[] }> = {};
  for (const zone of zones) grouped[zone.id] = { zone, tables: [] };
  for (const table of tables) grouped[table.zone_id]?.tables.push(table);
  return Object.values(grouped).filter((g) => g.tables.length > 0);
}
