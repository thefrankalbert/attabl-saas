// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStats } from '../useDashboardStats';

// X6: la page masque le chiffre d'affaires sans `reports.view`, mais ce
// rafraichissement client relisait `total` et `tip_amount` et recalculait la
// recette 30 s plus tard: le chef la voyait. Sans le droit, les montants ne
// sont plus demandes du tout (rien n'arrive dans le navigateur).

const selects: string[] = [];
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const c: Record<string, unknown> = {};
      c.select = vi.fn((cols: string) => {
        selects.push(cols);
        return c;
      });
      for (const m of ['eq', 'gte', 'lt', 'order', 'limit']) c[m] = vi.fn(() => c);
      c.then = (ok: (v: { data: unknown[]; error: null; count: number }) => unknown) =>
        ok({
          data: [{ id: 'o1', total: 5000, tip_amount: 0, payment_status: 'paid' }],
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
      expect(cols).not.toMatch(/\btotal\b|tip_amount|price_at_order/);
    }
    expect(result.current.data?.stats.revenueToday).toBe(0);
    expect(result.current.data?.revenueSparkline).toEqual([]);
  });

  it('avec reports.view: les montants sont lus', async () => {
    const { result } = renderHook(() => useDashboardStats('t1', true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(selects.some((cols) => /\btotal\b/.test(cols))).toBe(true);
    expect(result.current.data?.stats.revenueToday).toBeGreaterThan(0);
  });
});
