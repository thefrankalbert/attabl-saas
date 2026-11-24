import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAndSaveSuggestions } from '../suggestion.service';

// B95 (revue ligne par ligne, lot B2b-2): "Auto-generer" effacait TOUTES les
// suggestions du restaurant (DELETE par tenant_id), y compris celles creees a la
// main, puis inserait en une seconde requete sans transaction. La generation
// passe maintenant par `regenerate_auto_suggestions`, qui n'efface que les
// suggestions generees, dans une seule transaction (prouve en base par
// supabase/tests/rls/revue_lot_b2b2.test.sql).

function client() {
  const calls: Array<{ op: string; table?: string; args?: unknown }> = [];
  const items = [
    { id: 'a', name: 'Poulet', price: 5000, category_id: 'plats', is_available: true },
    { id: 'b', name: 'Poisson', price: 5500, category_id: 'plats', is_available: true },
    { id: 'c', name: 'Jus', price: 1000, category_id: 'boissons', is_available: true },
  ];
  const supabase = {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        delete: () => {
          calls.push({ op: 'delete', table });
          return q;
        },
        insert: (rows: unknown) => {
          calls.push({ op: 'insert', table, args: rows });
          return Promise.resolve({ error: null });
        },
        then: (r: (v: unknown) => unknown) => r({ data: items, error: null }),
      };
      return q;
    },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.push({ op: 'rpc', args: { fn, args } });
      return { data: 4, error: null };
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

describe('generateAndSaveSuggestions (B95)', () => {
  it('n efface rien directement: tout passe par la fonction transactionnelle', async () => {
    const { supabase, calls } = client();
    const count = await generateAndSaveSuggestions(supabase, 't1');

    expect(calls.filter((c) => c.op === 'delete')).toEqual([]);
    expect(calls.filter((c) => c.op === 'insert')).toEqual([]);
    const rpc = calls.find((c) => c.op === 'rpc')?.args as {
      fn: string;
      args: { p_tenant_id: string; p_rows: Array<Record<string, unknown>> };
    };
    expect(rpc.fn).toBe('regenerate_auto_suggestions');
    expect(rpc.args.p_tenant_id).toBe('t1');
    expect(rpc.args.p_rows.length).toBeGreaterThan(0);
    expect(rpc.args.p_rows[0]).toHaveProperty('display_order', 0);
    expect(count).toBe(4);
  });

  it('une erreur de la fonction remonte (rien n a ete efface: transaction annulee)', async () => {
    const { supabase } = client();
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    });
    await expect(generateAndSaveSuggestions(supabase, 't1')).rejects.toBeTruthy();
  });
});
