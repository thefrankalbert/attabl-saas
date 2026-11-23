import { describe, it, expect } from 'vitest';
import { computeDelta, computeDishMargin, computeMarginTotals } from '../advanced-report-math';

const poulet = { quantity: 3, revenue: 15000, hasRecipe: true, costComplete: true, unitCost: 1310 };
const jus = { quantity: 3, revenue: 3000, hasRecipe: false, costComplete: false, unitCost: null };
const riz = { quantity: 2, revenue: 4000, hasRecipe: true, costComplete: false, unitCost: 0 };

describe('computeDishMargin', () => {
  it('XOF (sans decimale): 15 000 - 3 x 1 310 = 11 070, soit 74 %', () => {
    expect(computeDishMargin(poulet, 'XOF')).toEqual({ cost: 3930, margin: 11070, marginPct: 74 });
  });

  it('EUR (2 decimales): le cout majeur est converti en centimes', () => {
    // 2 portions a 3,25 EUR de cout = 650 centimes; ventes 20,00 EUR = 2000.
    expect(
      computeDishMargin(
        { quantity: 2, revenue: 2000, hasRecipe: true, costComplete: true, unitCost: 3.25 },
        'EUR',
      ),
    ).toEqual({ cost: 650, margin: 1350, marginPct: 68 });
  });

  it('plat sans fiche: aucune marge inventee', () => {
    expect(computeDishMargin(jus, 'XOF')).toEqual({ cost: null, margin: null, marginPct: null });
  });

  it('marge negative quand le cout depasse le prix', () => {
    const r = computeDishMargin(
      { quantity: 1, revenue: 1000, hasRecipe: true, costComplete: true, unitCost: 1500 },
      'XOF',
    );
    expect(r.margin).toBe(-500);
    expect(r.marginPct).toBe(-50);
  });
});

describe('computeMarginTotals', () => {
  it('ne compte que les plats a fiche complete, et dit quelle part des ventes est couverte', () => {
    // Couvert: poulet seul (15 000 sur 22 000 = 68 %).
    expect(computeMarginTotals([poulet, jus, riz], 'XOF')).toEqual({
      coveredRevenue: 15000,
      margin: 11070,
      coveragePct: 68,
    });
  });

  it('aucune vente: 0 partout', () => {
    expect(computeMarginTotals([], 'XOF')).toEqual({
      coveredRevenue: 0,
      margin: 0,
      coveragePct: 0,
    });
  });
});

describe('computeDelta', () => {
  it('hausse en valeur et en pourcentage', () => {
    expect(computeDelta(53500, 47100)).toEqual({ diff: 6400, pct: 14 });
  });
  it('baisse', () => {
    expect(computeDelta(7, 10)).toEqual({ diff: -3, pct: -30 });
  });
  it('periode precedente a 0: pas de pourcentage', () => {
    expect(computeDelta(500, 0)).toEqual({ diff: 500, pct: null });
  });
});
