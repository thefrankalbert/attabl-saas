import type { QRPerPage } from '@/types/qr-design.types';

/**
 * A4 tiling geometry for QR card printing. Pure + framework-free so it is unit
 * testable. All units are millimetres. The "design format" is the card size
 * (e.g. the standard 25x13 cm); the "print format" is how many of those cards
 * are laid onto an A4 sheet (1 / 2 / 4 / auto).
 */

export const A4_SHORT = 210; // mm
export const A4_LONG = 297; // mm
const MARGIN = 10; // mm page margin

export interface TileCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TilingResult {
  orientation: 'portrait' | 'landscape';
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  perPage: number;
  cells: TileCell[]; // card placement rectangles (aspect-fit, centered in each grid cell)
}

/** Fit a card of (cardW x cardH) into a cell of (cellW x cellH), centered, preserving aspect. */
function fitCard(
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  cardW: number,
  cardH: number,
): TileCell {
  const scale = Math.min(cellW / cardW, cellH / cardH, 1);
  const w = cardW * scale;
  const h = cardH * scale;
  return { x: cellX + (cellW - w) / 2, y: cellY + (cellH - h) / 2, w, h };
}

/**
 * Compute the page orientation + grid + per-cell card rectangles.
 *
 * - orientation: landscape when the card is wider than tall, or too wide for a
 *   portrait A4 content area (e.g. the 250mm-wide standard card). Otherwise portrait.
 * - perPage 1/2/4: a fixed grid (1x1, 1x2, 2x2). 'auto' packs as many as fit.
 */
export function computeTiling(cardWmm: number, cardHmm: number, perPage: QRPerPage): TilingResult {
  const portraitContentW = A4_SHORT - 2 * MARGIN;
  const landscape = cardWmm > cardHmm || cardWmm > portraitContentW;

  const pageW = landscape ? A4_LONG : A4_SHORT;
  const pageH = landscape ? A4_SHORT : A4_LONG;
  const usableW = pageW - 2 * MARGIN;
  const usableH = pageH - 2 * MARGIN;

  let cols: number;
  let rows: number;
  if (perPage === 'auto') {
    cols = Math.max(1, Math.floor(usableW / cardWmm));
    rows = Math.max(1, Math.floor(usableH / cardHmm));
  } else if (perPage === 4) {
    cols = 2;
    rows = 2;
  } else if (perPage === 2) {
    cols = 1;
    rows = 2;
  } else {
    cols = 1;
    rows = 1;
  }

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const cells: TileCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(fitCard(MARGIN + c * cellW, MARGIN + r * cellH, cellW, cellH, cardWmm, cardHmm));
    }
  }

  return {
    orientation: landscape ? 'landscape' : 'portrait',
    pageW,
    pageH,
    cols,
    rows,
    perPage: cols * rows,
    cells,
  };
}
