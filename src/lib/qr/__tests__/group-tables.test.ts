import { describe, it, expect } from 'vitest';
import { groupTablesByZone } from '../group-tables';
import type { Table, Zone } from '@/types/admin.types';

const zone = (id: string, name: string) => ({ id, name }) as Zone;
const table = (id: string, zone_id: string) => ({ id, zone_id }) as Table;

describe('groupTablesByZone', () => {
  it('groups tables under their zone, preserving zone order', () => {
    const zones = [zone('z1', 'Salle'), zone('z2', 'Terrasse')];
    const tables = [table('t1', 'z1'), table('t2', 'z2'), table('t3', 'z1')];
    const result = groupTablesByZone(zones, tables);
    expect(result.map((g) => g.zone.id)).toEqual(['z1', 'z2']);
    expect(result[0].tables.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(result[1].tables.map((t) => t.id)).toEqual(['t2']);
  });

  it('drops zones with no tables', () => {
    const zones = [zone('z1', 'Salle'), zone('z2', 'Empty')];
    const result = groupTablesByZone(zones, [table('t1', 'z1')]);
    expect(result).toHaveLength(1);
    expect(result[0].zone.id).toBe('z1');
  });

  it('ignores tables whose zone is unknown', () => {
    const result = groupTablesByZone([zone('z1', 'Salle')], [table('t1', 'zX')]);
    expect(result).toHaveLength(0);
  });
});
