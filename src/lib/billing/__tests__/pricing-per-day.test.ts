import { describe, it, expect } from 'vitest';
import { PLAN_AMOUNTS, approxPricePerDay } from '../pricing';

describe('approxPricePerDay', () => {
  it('arrondit aux 50 FCFA (Pro mensuel 79 000 -> 2 650 et non 2 633)', () => {
    expect(approxPricePerDay(PLAN_AMOUNTS.pro.monthly)).toBe(2650);
  });

  it('rend un multiple de 50 pour chaque plan et chaque periode', () => {
    for (const plan of Object.values(PLAN_AMOUNTS)) {
      for (const montant of Object.values(plan)) {
        expect(approxPricePerDay(montant) % 50).toBe(0);
      }
    }
  });
});
