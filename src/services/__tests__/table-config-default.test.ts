import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTableConfigService } from '../table-config.service';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// B105 (revue ligne par ligne, lot B2b-2): createDefaultConfig creait toujours
// la zone "Salle principale" / prefixe "TAB" sans regarder l'existant. Si le
// restaurateur avait deja une zone de ce nom ou ce prefixe, l'onboarding en mode
// "skip" echouait (23505) a chaque essai et ne pouvait jamais se terminer.
//
// Base en memoire qui applique les deux index uniques de `zones`
// (tenant, venue, lower(name)) et (tenant, upper(prefix)), et celui de
// `tables` (tenant, table_number).

interface Zone {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  prefix: string;
}
interface Table {
  id: string;
  tenant_id: string;
  zone_id: string;
  table_number: string;
}

function db(zones: Zone[]) {
  const tables: Table[] = [];
  let seq = 0;
  const conflict = { data: null, error: { code: '23505', message: 'duplicate key' } };
  const client = {
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const rows = (): Record<string, unknown>[] =>
        (table === 'zones' ? zones : tables) as unknown as Record<string, unknown>[];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        like: (c: string, pattern: string) => {
          const prefix = pattern.replace('%', '');
          filters.push((r) => String(r[c]).startsWith(prefix));
          return q;
        },
        maybeSingle: async () => {
          const z = rows().find((r) => filters.every((f) => f(r))) as Zone | undefined;
          // Garde d'appartenance: zone -> venue -> tenant.
          return { data: z ? { venue: { tenant_id: z.tenant_id } } : null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }),
        insert: (input: Array<Record<string, unknown>>) => ({
          select: async () => {
            if (table === 'zones') {
              for (const z of input) {
                const clash = zones.some(
                  (e) =>
                    e.tenant_id === z.tenant_id &&
                    ((e.venue_id === z.venue_id &&
                      e.name.toLowerCase() === String(z.name).toLowerCase()) ||
                      e.prefix.toUpperCase() === String(z.prefix).toUpperCase()),
                );
                if (clash) return conflict;
              }
              const created = input.map((z) => ({ ...(z as unknown as Zone), id: `z${++seq}` }));
              zones.push(...created);
              return { data: created, error: null };
            }
            for (const t of input) {
              if (
                tables.some((e) => e.tenant_id === t.tenant_id && e.table_number === t.table_number)
              )
                return conflict;
            }
            const created = input.map((t) => ({ ...(t as unknown as Table), id: `t${++seq}` }));
            tables.push(...created);
            return { data: created, error: null };
          },
        }),
      };
      return q;
    },
  };
  return { supabase: client as unknown as SupabaseClient, zones, tables };
}

describe('createDefaultConfig (B105)', () => {
  it('reutilise une zone "Salle principale" deja creee dans cet etablissement', async () => {
    const { supabase, zones, tables } = db([
      { id: 'zx', tenant_id: 't1', venue_id: 'v1', name: 'Salle principale', prefix: 'SAL' },
    ]);
    const res = await createTableConfigService(supabase).createDefaultConfig('t1', 'v1', 3);
    expect(zones).toHaveLength(1);
    expect(res.zone.id).toBe('zx');
    expect(tables.map((t) => t.table_number)).toEqual(['SAL-1', 'SAL-2', 'SAL-3']);
  });

  it('prefixe TAB deja pris par une autre zone: choisit un prefixe libre', async () => {
    const { supabase, tables } = db([
      { id: 'zt', tenant_id: 't1', venue_id: 'v1', name: 'Terrasse', prefix: 'TAB' },
    ]);
    const res = await createTableConfigService(supabase).createDefaultConfig('t1', 'v1', 2);
    expect(res.zone.name).toBe('Salle principale');
    expect(res.zone.prefix).toBe('TAB2');
    expect(tables.map((t) => t.table_number)).toEqual(['TAB2-1', 'TAB2-2']);
  });

  it('temoin: restaurant vierge -> "Salle principale" / TAB comme avant', async () => {
    const { supabase, tables } = db([]);
    const res = await createTableConfigService(supabase).createDefaultConfig('t1', 'v1', 2);
    expect(res.zone.prefix).toBe('TAB');
    expect(tables.map((t) => t.table_number)).toEqual(['TAB-1', 'TAB-2']);
  });

  it('temoin: les zones d un autre restaurant ne comptent pas', async () => {
    const { supabase } = db([
      { id: 'zo', tenant_id: 't2', venue_id: 'v9', name: 'Salle principale', prefix: 'TAB' },
    ]);
    const res = await createTableConfigService(supabase).createDefaultConfig('t1', 'v1', 1);
    expect(res.zone.prefix).toBe('TAB');
    expect(res.zone.id).not.toBe('zo');
  });
});
