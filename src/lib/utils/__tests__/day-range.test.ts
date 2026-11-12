import { describe, it, expect } from 'vitest';
import { dayRangeToIso } from '../day-range';

describe('dayRangeToIso', () => {
  it('inclut toute la journee de fin: une perte de 12 h 13 tombe dans "du 10 au 10"', () => {
    const { start, end } = dayRangeToIso('2026-11-10', '2026-11-10');
    const perte = new Date('2026-11-10T12:13:00').getTime();

    expect(new Date(start!).getTime()).toBeLessThanOrEqual(perte);
    expect(new Date(end!).getTime()).toBeGreaterThanOrEqual(perte);
  });

  it('couvre exactement un jour, a une milliseconde pres', () => {
    const { start, end } = dayRangeToIso('2026-11-10', '2026-11-10');

    expect(new Date(end!).getTime() - new Date(start!).getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  // Temoin negatif: le lendemain reste dehors.
  it('exclut le lendemain a minuit', () => {
    const { end } = dayRangeToIso('2026-11-10', '2026-11-10');

    expect(new Date(end!).getTime()).toBeLessThan(new Date('2026-11-11T00:00:00').getTime());
  });

  it('laisse une borne absente ou illisible indefinie', () => {
    expect(dayRangeToIso(undefined, '')).toEqual({ start: undefined, end: undefined });
    expect(dayRangeToIso('pas-une-date', '2026-11-10').start).toBeUndefined();
  });
});
