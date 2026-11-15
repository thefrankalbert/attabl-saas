import { describe, it, expect } from 'vitest';
import { parseTip, tipPresets, cashQuickAdd } from '../payment-amounts';

// Audit caisse 2026-11-15: a negative custom tip lowered the amount to collect.
describe('parseTip', () => {
  it('ignore un pourboire negatif, vide ou illisible', () => {
    expect(parseTip('-2000', 'XOF')).toBe(0);
    expect(parseTip('', 'XOF')).toBe(0);
    expect(parseTip('abc', 'XOF')).toBe(0);
  });

  it('arrondit au franc en FCFA, au centime en euro', () => {
    expect(parseTip('1500.7', 'XOF')).toBe(1501);
    expect(parseTip('1.555', 'EUR')).toBe(1.56);
  });

  it('plafonne comme le serveur', () => {
    expect(parseTip('1e9', 'XOF')).toBe(1_000_000);
  });

  it('garde un pourboire normal tel quel (temoin)', () => {
    expect(parseTip('500', 'XOF')).toBe(500);
  });
});

describe('raccourcis selon la devise', () => {
  it('FCFA: milliers; euro: unites', () => {
    expect(tipPresets('XAF')).toEqual([1000, 2000, 5000]);
    expect(tipPresets('EUR')).toEqual([1, 2, 5]);
    expect(cashQuickAdd('XOF')[0]).toBe(1000);
    expect(cashQuickAdd('USD')[0]).toBe(5);
  });
});
