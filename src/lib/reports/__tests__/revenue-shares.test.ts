import { describe, it, expect } from 'vitest';
import { revenueShares } from '../revenue-shares';

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

describe('revenueShares', () => {
  it('totalise exactement 100 malgre les arrondis (3 tiers)', () => {
    const shares = revenueShares([1, 1, 1]);
    expect(sum(shares)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it('un espace aux remboursements superieurs: part 0, jamais negative, total 100', () => {
    const shares = revenueShares([8000, -2000, 2000]);
    expect(shares).toEqual([80, 0, 20]);
    expect(Math.min(...shares)).toBe(0);
    expect(sum(shares)).toBe(100);
  });

  it('cas du banc: les parts affichees totalisent 100', () => {
    expect(sum(revenueShares([331900, 177800, 130900, 107100, 79000]))).toBe(100);
  });

  it('aucun chiffre positif: toutes les parts a 0', () => {
    expect(revenueShares([0, -500])).toEqual([0, 0]);
  });
});
