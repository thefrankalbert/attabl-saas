// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ChartPeriod, Tenant } from '@/types/command-center.types';

// Revue L017: A19 (le super administrateur passe par la route serveur, plus par
// la lecture navigateur limitee par la RLS) et A20 (une reponse tardive d'une
// periode precedente n'ecrase plus le graphique).

// Traducteur STABLE, comme next-intl: une fonction neuve a chaque rendu
// relancerait l'effet de chargement en boucle.
const { t } = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => t }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const { browserFrom } = vi.hoisted(() => ({ browserFrom: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: browserFrom }) }));

import { useCommandCenterData } from '../use-command-center-data';

const TENANT: Tenant = {
  id: '22222222-2222-4222-a222-222222222222',
  slug: 'resto',
  name: 'Resto',
  subscription_status: 'active',
  subscription_plan: 'pro',
  is_active: true,
};

// Stables d'un rendu a l'autre, comme dans la page (useMemo): un tableau neuf a
// chaque rendu relancerait les effets en boucle.
const BASE_TENANTS = [TENANT];
const LOGOS = new Map<string, string | null>();

const EMPTY_OVERVIEW = {
  todayOrders: [],
  yesterdayOrders: [],
  todayPayments: [],
  yesterdayPayments: [],
  recentOrders: [],
};

/** Reponse minimale de fetch (sans le Response de happy-dom, qui bloque act). */
function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

/** Reponses du graphique retenues, liberees dans l'ordre choisi par le test. */
let pendingCharts: Array<{ start: string; release: () => void }> = [];

function installFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { kind: string; start?: string };
    if (body.kind === 'overview') {
      return jsonResponse(EMPTY_OVERVIEW);
    }
    return new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      pendingCharts.push({
        start: body.start as string,
        release: () => resolve(jsonResponse({ payments: [], orders: [] })),
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function render(period: ChartPeriod) {
  return renderHook(
    ({ p }: { p: ChartPeriod }) =>
      useCommandCenterData({ baseTenants: BASE_TENANTS, logoBySlug: LOGOS, superAdmin: true }, p),
    { initialProps: { p: period } },
  );
}

describe('useCommandCenterData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingCharts = [];
  });

  it('A19: super administrateur, les chiffres viennent de la route serveur', async () => {
    const fetchMock = installFetch();
    render('day');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/command-center');
    expect(browserFrom).not.toHaveBeenCalled();
  });

  it('A20: la reponse tardive du "mois" n ecrase pas le graphique du "jour"', async () => {
    installFetch();
    const { result, rerender, unmount } = render('month');
    await waitFor(() => expect(pendingCharts).toHaveLength(1));
    rerender({ p: 'day' });
    await waitFor(() => expect(pendingCharts).toHaveLength(2));

    const [month, day] = pendingCharts;
    day.release();
    await waitFor(() => expect(result.current.isChartLoading).toBe(false));
    // Laisser la reponse tardive arriver et etre traitee (quelques tours de
    // microtaches: fetch, json, puis l'ecriture eventuelle de l'etat).
    await act(async () => {
      month.release();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    // "jour" = un point par heure ecoulee (00h..heure courante).
    expect(result.current.chartData).toHaveLength(new Date().getHours() + 1);
    expect(result.current.chartData[0].label).toBe('00h');
    unmount();
    vi.unstubAllGlobals();
  });
});
