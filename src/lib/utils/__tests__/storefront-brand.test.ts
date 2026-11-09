import { describe, it, expect } from 'vitest';

import {
  STOREFRONT_DEFAULT_PRIMARY,
  resolveStorefrontPrimary,
  storefrontBrandStyle,
} from '@/lib/utils/storefront-brand';
import { contrastRatio } from '@/lib/utils/wcag';

/**
 * The storefront CTAs ("Commander", "Plat du jour") were painted with the
 * fixed green `--color-brand`: a Ruby restaurant got green buttons.
 */
describe('storefrontBrandStyle', () => {
  const tokens = (color: string | null | undefined) =>
    storefrontBrandStyle(color) as Record<string, string>;

  it('paints the CTA with the tenant primary color', () => {
    expect(tokens('#EF4444')['--brand-cta']).toBe('#EF4444');
  });

  it('never overrides --color-brand (status indicators keep their meaning)', () => {
    expect(Object.keys(tokens('#EF4444'))).toEqual([
      '--brand-cta',
      '--brand-cta-fg',
      '--brand-accent',
    ]);
  });

  it('gives an accent (text/icon on white) that keeps the tenant hue and reads at 4.5:1', () => {
    // Ruby as text on white measures 3.76:1: it must be darkened, not replaced.
    const ruby = tokens('#EF4444')['--brand-accent'];
    expect(ruby).not.toBe('#EF4444');
    expect(contrastRatio(ruby, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ruby.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    // Lime as text on white is 1.18:1.
    expect(contrastRatio(tokens('#CCFF00')['--brand-accent'], '#FFFFFF')).toBeGreaterThanOrEqual(
      4.5,
    );
    // Already readable: kept as is.
    expect(tokens('#1E40AF')['--brand-accent']).toBe('#1E40AF');
  });

  it('falls back to the ATTABL lime when the tenant has no valid color', () => {
    for (const bad of [null, undefined, '', 'red; background: url(x)']) {
      expect(tokens(bad)['--brand-cta']).toBe(STOREFRONT_DEFAULT_PRIMARY);
      expect(resolveStorefrontPrimary(bad)).toBe(STOREFRONT_DEFAULT_PRIMARY);
    }
  });

  it.each([
    ['#CCFF00', '#000000'], // lime: white would measure 1.18:1
    ['#EAB308', '#000000'], // gold
    ['#34D399', '#000000'], // mint
    ['#9B111E', '#FFFFFF'], // deep ruby
    ['#1A1A1A', '#FFFFFF'],
  ])('picks the readable text color on %s', (bg, fg) => {
    const t = tokens(bg);
    expect(t['--brand-cta-fg']).toBe(fg);
    // Never the worse of the two candidates.
    const other = fg === '#FFFFFF' ? '#000000' : '#FFFFFF';
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
  });

  it('gives every BrandingStep preset a text color of at least 4.5:1 (AA)', () => {
    for (const bg of [
      '#CCFF00',
      '#3B82F6',
      '#EF4444',
      '#22C55E',
      '#A855F7',
      '#F97316',
      '#EAB308',
      '#EC4899',
      '#14B8A6',
      '#64748B',
      '#F97171',
      '#1E40AF',
      '#34D399',
      '#9F1239',
      '#374151',
    ]) {
      const t = tokens(bg);
      expect(contrastRatio(t['--brand-cta'], t['--brand-cta-fg'])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
