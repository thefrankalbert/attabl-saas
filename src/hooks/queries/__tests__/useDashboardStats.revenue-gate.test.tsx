// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStats } from '../useDashboardStats';
import { getDayStartInZone } from '@/lib/timezones';

// X6: la page masque le chiffre d'affaires sans `reports.view`, mais ce
// rafraichissement client relisait `total` et `tip_amount` et recalculait la
// recette 30 s plus tard: le chef la voyait. Sans le droit, les montants ne
// sont plus demandes du tout (rien n'arrive dans le navigateur).

const selects: string[] = [];
const queries: Array<{ cols: string; opts?: unknown; calls: Array<[string, unknown]> }> = [];
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const c: Record<string, unknown> = {};
      const q = { cols: '', opts: undefined as unknown, calls: [] as Array<[string, unknown]> };
      queries.push(q);
      c.select = vi.fn((cols: string, opts?: unknown) => {
        selects.push(cols);
        q.cols = cols;
        q.opts = opts;
        return c;
      });
      for (const m of ['eq', 'gte', 'lt', 'order', 'limit', 'in'])
        c[m] = vi.fn((col: unknown, val?: unknown) => {
          q.calls.push([m, m === 'limit' ? col : val]);
          return c;
        });
      c.then = (ok: (v: { data: unknown[]; error: null; count: number }) => unknown) =>
        ok({
          // One row that works both as an order and as a payments-ledger
          // row (C-041: revenue is read from `payments`).
          data: [
            {
              id: 'o1',
              order_id: 'o1',
              total: 5000,
              tip_amount: 0,
              payment_status: 'paid',
              amount: 5000,
              status: 'completed',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
          count: 0,
        });
      return c;
    },
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  selects.length = 0;
  queries.length = 0;
});

describe('useDashboardStats - argent selon reports.view', () => {
  it('sans reports.view: aucune colonne de montant demandee, recette a zero', async () => {
    const { result } = renderHook(() => useDashboardStats('t1', false), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selects.length).toBeGreaterThan(0);
    // Les requetes d'agregat (recette, tendance, courbe, repartition) ne
    // lisent plus l'argent. La liste des dernieres commandes garde le montant
    // de chaque commande, deja visible sur /orders avec `orders.view`.
    const aggregates = selects.filter((cols) => !cols.includes('order_number'));
    expect(aggregates.length).toBeGreaterThan(0);
    for (const cols of aggregates) {
      expect(cols).not.toMatch(/\btotal\b|tip_amount|price_at_order|\bamount\b/);
    }
    expect(result.current.data?.stats.revenueToday).toBe(0);
  });

  it('avec reports.view: les montants sont lus', async () => {
    const { result } = renderHook(() => useDashboardStats('t1', true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selects.some((cols) => /\bamount\b/.test(cols))).toBe(true);
    expect(result.current.data?.stats.revenueToday).toBe(5000);
  });

  it('periode Hier: la liste est lue EN BASE entre le debut d hier et ce matin (audit N1)', async () => {
    const { result } = renderHook(
      () => useDashboardStats('t1', true, undefined, 'Africa/Ouagadougou', 'yesterday'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const list = queries.find((q) => q.cols.includes('order_number'));
    expect(list).toBeDefined();
    // Bornes EXACTES: debut d'hier et debut d'aujourd'hui, dans le fuseau du restaurant.
    const tz = 'Africa/Ouagadougou';
    expect(list!.calls).toContainEqual(['gte', getDayStartInZone(tz, 1).toISOString()]);
    expect(list!.calls).toContainEqual(['lt', getDayStartInZone(tz, 0).toISOString()]);
    expect(list!.calls).toContainEqual(['limit', 200]);
  });

  it('periode Aujourd hui: pas de borne de fin, plus de plafond a 12 (temoin)', async () => {
    const { result } = renderHook(
      () => useDashboardStats('t1', true, undefined, 'Africa/Ouagadougou'),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const list = queries.find((q) => q.cols.includes('order_number'));
    expect(list!.calls.map(([m]) => m)).not.toContain('lt');
    expect(list!.calls).not.toContainEqual(['limit', 12]);
  });

  it('annonce le total de la periode quand la liste est plafonnee', async () => {
    const { result } = renderHook(
      () => useDashboardStats('t1', true, undefined, 'Africa/Ouagadougou', '30d'),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Le total vient du COUNT de la base (le faux client renvoie count 0 pour
    // une ligne), pas de la longueur de la liste plafonnee.
    const list = queries.find((q) => q.cols.includes('order_number'));
    expect(list!.opts).toEqual({ count: 'exact' });
    expect(result.current.data?.recentOrdersTotal).toBe(0);
    expect(result.current.data?.recentOrders).toHaveLength(1);
  });
});
