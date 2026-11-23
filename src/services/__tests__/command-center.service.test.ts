import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createCommandCenterService } from '../command-center.service';

const T = '22222222-2222-4222-a222-222222222222';

/** Faux client: `payments` renvoie `total` lignes, par pages selon `.range()`. */
function makeSupabase(total: number) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    calls.push({ table, filters });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
    for (const m of ['in', 'gte', 'lt']) {
      chain[m] = (c: string, v: unknown) => {
        filters.push([c, v]);
        return chain;
      };
    }
    chain.range = async (a: number, b: number) => {
      if (table !== 'payments') return { data: [], error: null };
      const rows = [];
      for (let i = a; i <= Math.min(b, total - 1); i++) {
        rows.push({
          tenant_id: T,
          amount: 100,
          status: 'completed',
          created_at: '2026-11-21T10:00:00Z',
          orders: { display_currency: 'XOF' },
        });
      }
      return { data: rows, error: null };
    };
    chain.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
    return chain;
  };
  return { supabase: { from } as unknown as SupabaseClient, calls };
}

describe('createCommandCenterService.loadChart', () => {
  it('lit TOUTES les pages du registre (la reponse PostgREST est plafonnee a 1000)', async () => {
    const { supabase } = makeSupabase(2500);
    const chart = await createCommandCenterService(supabase).loadChart([T], '2026-11-01T00:00:00Z');
    expect(chart.payments).toHaveLength(2500);
    expect(chart.payments[0]).toEqual({
      tenant_id: T,
      amount: 100,
      status: 'completed',
      created_at: '2026-11-21T10:00:00Z',
      display_currency: 'XOF',
    });
  });

  it('borne chaque lecture aux restaurants demandes', async () => {
    const { supabase, calls } = makeSupabase(1);
    await createCommandCenterService(supabase).loadChart([T], '2026-11-01T00:00:00Z');
    for (const c of calls) expect(c.filters).toContainEqual(['tenant_id', [T]]);
  });
});
