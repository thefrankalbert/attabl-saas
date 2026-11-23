import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDateRange, parseOrderSummary, parseServerPerformance } from '../useReportData';

/**
 * Bornes des periodes de rapport, au calendrier du RESTAURANT (fuseau passe en
 * parametre), jamais a celui de l'appareil ni du serveur de test:
 *  - instants absolus (ISO avec Z);
 *  - minuit = minuit du restaurant;
 *  - periode precedente contigue (prevEnd = start - 1 ms).
 * Douala est en UTC+1 sans heure d'ete: minuit local = 23 h UTC la veille.
 * Les assertions ne dependent pas du fuseau de la machine qui lance les tests.
 */
const TZ = 'Africa/Douala';

describe('getDateRange', () => {
  // 11 h a Douala le 15 mars 2026.
  const FIXED_NOW = new Date('2026-03-15T10:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const inRange = (r: { startDate: string; endDate: string }, iso: string) =>
    new Date(iso) >= new Date(r.startDate) && new Date(iso) <= new Date(r.endDate);

  it('emits absolute UTC instants (ISO with Z), never offset-less strings', () => {
    for (const p of ['today', '7d', '30d', '90d', 'thisMonth', 'lastMonth', 'thisYear'] as const) {
      const r = getDateRange(p, TZ);
      for (const v of [r.startDate, r.endDate, r.prevStartDate, r.prevEndDate]) {
        expect(v).toMatch(/Z$/);
      }
    }
  });

  it("aujourd'hui commence a minuit HEURE DU RESTAURANT et finit maintenant", () => {
    const r = getDateRange('today', TZ);
    expect(r.startDate).toBe('2026-03-14T23:00:00.000Z');
    expect(r.endDate).toBe(FIXED_NOW.toISOString());
  });

  it('une commande a 00 h 30 heure du restaurant compte aujourd hui, une a 23 h 30 la veille non', () => {
    const r = getDateRange('today', TZ);
    // 00 h 30 a Douala le 15 = 23 h 30 UTC le 14: un calcul a l'heure UTC l'oubliait.
    expect(inRange(r, '2026-03-14T23:30:00.000Z')).toBe(true);
    // 23 h 30 a Douala le 14 = 22 h 30 UTC le 14: c'est la journee d'hier.
    expect(inRange(r, '2026-03-14T22:30:00.000Z')).toBe(false);
  });

  it('meme resultat quel que soit le fuseau de l appareil (temoin: un autre fuseau donne d autres bornes)', () => {
    const douala = getDateRange('today', TZ);
    const ouaga = getDateRange('today', 'Africa/Ouagadougou');
    expect(ouaga.startDate).toBe('2026-03-15T00:00:00.000Z');
    expect(douala.startDate).not.toBe(ouaga.startDate);
  });

  it('7 jours: depuis minuit du restaurant il y a 6 jours', () => {
    expect(getDateRange('7d', TZ).startDate).toBe('2026-03-08T23:00:00.000Z');
  });

  it('ce mois: depuis le 1er a minuit du restaurant', () => {
    expect(getDateRange('thisMonth', TZ).startDate).toBe('2026-02-28T23:00:00.000Z');
  });

  it('mois dernier: tout fevrier, jusqu a la derniere milliseconde avant le 1er mars local', () => {
    const r = getDateRange('lastMonth', TZ);
    expect(r.startDate).toBe('2026-01-31T23:00:00.000Z');
    expect(r.endDate).toBe('2026-02-28T22:59:59.999Z');
  });

  it('cette annee: depuis le 1er janvier a minuit du restaurant', () => {
    expect(getDateRange('thisYear', TZ).startDate).toBe('2025-12-31T23:00:00.000Z');
  });

  it('la periode precedente est contigue: prevEnd = start - 1 ms', () => {
    for (const p of ['today', '7d', '30d', 'thisMonth', 'lastMonth', 'thisYear'] as const) {
      const r = getDateRange(p, TZ);
      expect(new Date(r.prevEndDate).getTime()).toBe(new Date(r.startDate).getTime() - 1);
      expect(new Date(r.prevStartDate).getTime()).toBeLessThanOrEqual(
        new Date(r.prevEndDate).getTime(),
      );
    }
  });

  it('7 jours: la periode precedente couvre les 7 jours d avant, a minuit local', () => {
    expect(getDateRange('7d', TZ).prevStartDate).toBe('2026-03-01T23:00:00.000Z');
  });
});

describe('parseOrderSummary', () => {
  it('reads the first row of a RETURNS TABLE array (the real RPC shape)', () => {
    // get_order_summary returns an array; reading it as an object zeroed the KPIs.
    const data = [{ total_revenue: 14_613_500, total_orders: 618, avg_basket: 23_646.4 }];
    expect(parseOrderSummary(data)).toEqual({
      revenue: 14_613_500,
      orders: 618,
      avgBasket: 23_646,
      tips: 0,
    });
  });

  it('returns zeros for an empty result set', () => {
    expect(parseOrderSummary([])).toEqual({ revenue: 0, orders: 0, avgBasket: 0, tips: 0 });
  });

  it('returns zeros for null', () => {
    expect(parseOrderSummary(null)).toEqual({ revenue: 0, orders: 0, avgBasket: 0, tips: 0 });
  });

  it('tolerates a bare object (in case a caller uses .single())', () => {
    expect(parseOrderSummary({ total_revenue: 100, total_orders: 2, avg_basket: 50 })).toEqual({
      revenue: 100,
      orders: 2,
      avgBasket: 50,
      tips: 0,
    });
  });

  // Constat C (audit pourboires 2026-11-20): `total_tips` etait renvoye par la
  // base mais lu par personne, si bien qu'aucun rapport ne montrait les pourboires.
  it('lit les pourboires de la periode (total_tips)', () => {
    const data = [{ total_revenue: 5500, total_orders: 1, avg_basket: 5500, total_tips: 500 }];
    expect(parseOrderSummary(data).tips).toBe(500);
  });
});

// Constat D: pourboires par serveur, colonne `tips` de get_server_performance.
describe('parseServerPerformance', () => {
  it('lit les pourboires de chaque serveur et calcule le panier moyen', () => {
    const rows = [{ server_id: 's1', server_name: 'Awa', orders: 2, revenue: 11000, tips: 1000 }];
    expect(parseServerPerformance(rows)).toEqual([
      { serverName: 'Awa', orders: 2, revenue: 11000, avgOrder: 5500, tips: 1000 },
    ]);
  });

  it('vaut zero quand la colonne manque (ancienne fonction) ou sans donnees', () => {
    expect(
      parseServerPerformance([{ server_id: 's1', server_name: 'Awa', orders: 0, revenue: 0 }]),
    ).toEqual([{ serverName: 'Awa', orders: 0, revenue: 0, avgOrder: 0, tips: 0 }]);
    expect(parseServerPerformance(null)).toEqual([]);
  });
});
