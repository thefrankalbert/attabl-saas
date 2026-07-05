import { describe, it, expect } from 'vitest';
import { computeTiling, A4_SHORT, A4_LONG } from '../pdf-tiling';

describe('computeTiling', () => {
  it('places a single card centered on a portrait A4 for perPage=1', () => {
    const r = computeTiling(100, 130, 1);
    expect(r.orientation).toBe('portrait');
    expect(r.pageW).toBe(A4_SHORT);
    expect(r.pageH).toBe(A4_LONG);
    expect(r.perPage).toBe(1);
    expect(r.cells).toHaveLength(1);
  });

  it('builds a 2x2 grid for perPage=4', () => {
    const r = computeTiling(90, 55, 4);
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(2);
    expect(r.cells).toHaveLength(4);
  });

  it('stacks two cards vertically for perPage=2', () => {
    const r = computeTiling(100, 100, 2);
    expect(r.cols).toBe(1);
    expect(r.rows).toBe(2);
    expect(r.cells).toHaveLength(2);
  });

  it('switches to landscape for the wide 25x13 standard card', () => {
    const r = computeTiling(250, 130, 1);
    expect(r.orientation).toBe('landscape');
    expect(r.pageW).toBe(A4_LONG);
    expect(r.pageH).toBe(A4_SHORT);
    // card must fit within the landscape content area
    expect(r.cells[0].w).toBeLessThanOrEqual(A4_LONG - 20 + 0.01);
  });

  it('auto packs multiple small cards per page', () => {
    const r = computeTiling(85, 55, 'auto');
    expect(r.perPage).toBeGreaterThan(1);
    expect(r.cells.length).toBe(r.perPage);
  });

  it('keeps every card rectangle inside the page margins', () => {
    const r = computeTiling(100, 130, 4);
    for (const cell of r.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(10 - 0.01);
      expect(cell.y).toBeGreaterThanOrEqual(10 - 0.01);
      expect(cell.x + cell.w).toBeLessThanOrEqual(r.pageW - 10 + 0.01);
      expect(cell.y + cell.h).toBeLessThanOrEqual(r.pageH - 10 + 0.01);
    }
  });
});
