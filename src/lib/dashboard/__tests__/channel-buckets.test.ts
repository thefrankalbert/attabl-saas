import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildChannelBuckets, fetchChartPayments } from '../channel-buckets';

// Audit d'equipe du 2026-11-27: DASH-03 (graphique tronque a 1 000 paiements)
// et DASH-04 (jours en UTC au lieu du jour du restaurant).

describe('buildChannelBuckets: jour du restaurant', () => {
  it('un paiement compte pour le jour DU RESTAURANT, pas le jour UTC', () => {
    const tz = 'Asia/Tokyo'; // UTC+9: 2026-11-27 22:30 UTC = 2026-11-28 07:30 a Tokyo
    const dayStarts = [new Date('2026-11-26T15:00:00Z'), new Date('2026-11-27T15:00:00Z')]; // minuit Tokyo
    const buckets = buildChannelBuckets(
      [{ amount: 1000, status: 'completed', created_at: '2026-11-27T22:30:00Z' }],
      dayStarts,
      tz,
    );
    expect(buckets.map((b) => b.date)).toEqual(['2026-11-27', '2026-11-28']);
    expect(buckets[1].surplace).toBe(1000);
    expect(buckets[0].surplace).toBe(0);
  });
});

describe('fetchChartPayments: tous les paiements, page par page', () => {
  it('lit au-dela de 1 000 lignes, pour CE restaurant, dans un ordre stable', async () => {
    const pages = [1000, 1000, 250];
    const ranges: Array<[number, number]> = [];
    const calls: Array<[string, unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'order'])
      builder[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return builder;
      };
    builder.range = (from: number, to: number) => {
      ranges.push([from, to]);
      const n = pages[ranges.length - 1] ?? 0;
      return Promise.resolve({
        data: Array.from({ length: n }, () => ({
          amount: 1,
          status: 'completed',
          created_at: 'x',
        })),
        error: null,
      });
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    const { data } = await fetchChartPayments(supabase, 't1', '2026-09-01T00:00:00Z');
    expect(data).toHaveLength(2250);
    expect(calls).toContainEqual(['eq', ['tenant_id', 't1']]);
    expect(calls).toContainEqual(['gte', ['created_at', '2026-09-01T00:00:00Z']]);
    expect(calls).toContainEqual(['order', ['created_at', { ascending: true }]]);
    expect(calls).toContainEqual(['order', ['id', { ascending: true }]]);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('une page incomplete arrete la lecture (temoin)', async () => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'order']) builder[m] = () => builder;
    const range = vi.fn(() => Promise.resolve({ data: [{ amount: 1 }], error: null }));
    builder.range = range;
    const supabase = { from: () => builder } as unknown as SupabaseClient;
    await fetchChartPayments(supabase, 't1', 'x');
    expect(range).toHaveBeenCalledTimes(1);
  });

  it('lecture en echec: graphique vide, aucune exception (le reste de la page tient)', async () => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'order']) builder[m] = () => builder;
    builder.range = () => Promise.resolve({ data: null, error: { message: 'timeout' } });
    const supabase = { from: () => builder } as unknown as SupabaseClient;
    await expect(fetchChartPayments(supabase, 't1', 'x')).resolves.toEqual({ data: [] });
  });
});
