'use client';

import { createElement } from 'react';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import { captureElementToCanvas } from '@/lib/qr/capture-template';
import { computeTiling } from '@/lib/qr/pdf-tiling';
import type { QRDesignConfig } from '@/types/qr-design.types';

export interface ExportCard {
  /** URL the QR encodes (already built with the canonical table_number). */
  url: string;
  /** Human caption printed on the card (e.g. the table display name). */
  tableName?: string;
  config: QRDesignConfig;
  tenantName: string;
  logoUrl?: string;
}

/** Poll until the async QR <svg> is appended to `el`, or resolve null on timeout. */
async function waitForSvg(el: HTMLElement, timeoutMs = 2000): Promise<SVGElement | null> {
  const start = Date.now();
  for (;;) {
    const svg = el.querySelector('svg');
    if (svg) return svg;
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Render one styled QR card (its template + StyledQR) off-screen and rasterize it.
 * Returns null if the QR never painted (caller decides how to report the skip).
 */
async function renderCardToCanvas(
  card: ExportCard,
  html2canvas: Parameters<typeof captureElementToCanvas>[1],
): Promise<HTMLCanvasElement | null> {
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    const Template = TEMPLATE_REGISTRY[card.config.templateId];
    root.render(
      createElement(Template, {
        config: card.config,
        url: card.url,
        tenantName: card.tenantName,
        tableName: card.tableName,
        logoUrl: card.logoUrl,
      }),
    );
    const svg = await waitForSvg(container);
    if (!svg) return null;
    // one more frame so qr-code-styling finishes painting into the SVG
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return await captureElementToCanvas(container, html2canvas);
  } finally {
    root.unmount();
    container.remove();
  }
}

/**
 * Batch export: one styled card per table (each with its own resolved design),
 * one card centered per A4 page. Returns the list of table captions that were
 * skipped because their QR never rendered, so the caller can warn the user.
 */
export async function exportResolvedCardsToPdf(
  cards: ExportCard[],
  filename: string,
): Promise<{ skipped: string[] }> {
  const { default: jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas-pro')).default as unknown as Parameters<
    typeof captureElementToCanvas
  >[1];

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const skipped: string[] = [];
  let placed = 0;

  for (const card of cards) {
    const canvas = await renderCardToCanvas(card, html2canvas);
    if (!canvas) {
      skipped.push(card.tableName || card.url);
      continue;
    }
    // Centre one card on its own page using the card's physical size (mm),
    // scaled to fit within A4 margins via computeTiling(perPage: 1).
    const tiling = computeTiling(card.config.templateWidth, card.config.templateHeight, 1);
    if (placed > 0) pdf.addPage();
    const cell = tiling.cells[0];
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', cell.x, cell.y, cell.w, cell.h);
    placed += 1;
  }

  if (placed === 0) return { skipped };
  pdf.save(filename);
  return { skipped };
}
