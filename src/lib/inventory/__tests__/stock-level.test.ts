import { describe, it, expect } from 'vitest';
import { getStockLevel } from '../stock-level';

describe('getStockLevel', () => {
  it('rupture quand le stock est a 0 ou moins, meme sans seuil', () => {
    expect(getStockLevel({ current_stock: 0, min_stock_alert: 5 })).toBe('out');
    expect(getStockLevel({ current_stock: -2, min_stock_alert: 0 })).toBe('out');
  });

  it('stock bas quand le stock est positif et au plus egal au seuil', () => {
    expect(getStockLevel({ current_stock: 5, min_stock_alert: 5 })).toBe('low');
    expect(getStockLevel({ current_stock: 0.5, min_stock_alert: 5 })).toBe('low');
  });

  it('ok au-dessus du seuil, et toujours ok sans seuil tant qu il reste du stock', () => {
    expect(getStockLevel({ current_stock: 5.001, min_stock_alert: 5 })).toBe('ok');
    expect(getStockLevel({ current_stock: 3, min_stock_alert: 0 })).toBe('ok');
  });
});
