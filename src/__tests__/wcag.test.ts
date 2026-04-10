import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  meetsWCAG_AA,
  validateBrandPrimary,
  suggestCompliantShade,
} from '@/lib/utils/wcag';

describe('hexToRgb', () => {
  it('parses pure white', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses pure black', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses the app primary brand green', () => {
    expect(hexToRgb('#06C167')).toEqual({ r: 6, g: 193, b: 103 });
  });

  it('is case insensitive', () => {
    expect(hexToRgb('#06c167')).toEqual({ r: 6, g: 193, b: 103 });
  });

  it('returns null for invalid input', () => {
    expect(hexToRgb('invalid')).toBeNull();
    expect(hexToRgb('#ABC')).toBeNull();
    expect(hexToRgb('06C167')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('returns 1 for white', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('returns 0 for black', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for white on black (maximum contrast)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
  });

  it('returns 1 for identical colors (minimum contrast)', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#06C167', '#06C167')).toBeCloseTo(1, 5);
  });

  it('computes a low ratio for brand green against white (fails AA)', () => {
    const ratio = contrastRatio('#06C167', '#FFFFFF');
    // Real value is ~2.1-2.6, which fails AA.
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(3);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#ABCDEF')).toBeCloseTo(contrastRatio('#ABCDEF', '#123456'), 5);
  });

  it('returns 1 when either hex is invalid', () => {
    expect(contrastRatio('nope', '#FFFFFF')).toBe(1);
  });
});

describe('meetsWCAG_AA', () => {
  it('passes dark text on white for normal text', () => {
    expect(meetsWCAG_AA('#1A1A1A', '#FFFFFF')).toBe(true);
  });

  it('fails light gray on white for normal text', () => {
    expect(meetsWCAG_AA('#B0B0B0', '#FFFFFF')).toBe(false);
  });

  it('is more permissive for large text', () => {
    // A mid-gray that fails 4.5:1 but may pass 3:1.
    const fg = '#949494';
    const normal = meetsWCAG_AA(fg, '#FFFFFF', false);
    const large = meetsWCAG_AA(fg, '#FFFFFF', true);
    expect(normal).toBe(false);
    expect(large).toBe(true);
  });
});

describe('validateBrandPrimary', () => {
  it('accepts the brand green (#06C167) as grandfathered by default', () => {
    const result = validateBrandPrimary('#06C167');
    expect(result.valid).toBe(true);
    expect(result.grandfathered).toBe(true);
    expect(result.ratio).toBeGreaterThan(1);
    expect(result.ratio).toBeLessThan(3);
  });

  it('rejects the brand green (#06C167) when grandfathered bypass is disabled', () => {
    const result = validateBrandPrimary('#06C167', { allowGrandfathered: false });
    expect(result.valid).toBe(false);
    expect(result.ratio).toBeGreaterThan(1);
    expect(result.reason).toBeDefined();
    expect(result.grandfathered).toBeUndefined();
  });

  it('accepts the brand green (#06C167) under large-text rules (grandfathered takes priority)', () => {
    const result = validateBrandPrimary('#06C167', { isLargeText: true });
    expect(result.valid).toBe(true);
    expect(result.grandfathered).toBe(true);
  });

  it('rejects the brand green (#06C167) when both grandfathered is disabled and large text is set', () => {
    // Ratio ~2.1 still fails the 3:1 large-text threshold.
    const result = validateBrandPrimary('#06C167', {
      allowGrandfathered: false,
      isLargeText: true,
    });
    expect(result.valid).toBe(false);
  });

  it('is case insensitive for grandfathered colors', () => {
    const result = validateBrandPrimary('#06c167');
    expect(result.valid).toBe(true);
    expect(result.grandfathered).toBe(true);
  });

  it('rejects yellow (#FFFF00) on white', () => {
    const result = validateBrandPrimary('#FFFF00');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('accepts a dark color that clears 4.5:1 against white', () => {
    const result = validateBrandPrimary('#1A1A1A');
    expect(result.valid).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    expect(result.reason).toBeUndefined();
  });

  it('uses the 3:1 threshold when isLargeText is true', () => {
    // #949494 fails 4.5:1 but passes 3:1 on white.
    const normal = validateBrandPrimary('#949494');
    const large = validateBrandPrimary('#949494', { isLargeText: true });
    expect(normal.valid).toBe(false);
    expect(large.valid).toBe(true);
  });

  it('rejects invalid hex input', () => {
    const result = validateBrandPrimary('not-a-color');
    expect(result.valid).toBe(false);
    expect(result.ratio).toBe(0);
  });
});

describe('suggestCompliantShade', () => {
  it('returns a darker yellow that meets AA', () => {
    const suggestion = suggestCompliantShade('#FFFF00');
    expect(suggestion).not.toBeNull();
    if (suggestion) {
      expect(validateBrandPrimary(suggestion).valid).toBe(true);
    }
  });

  it('darkens the brand green into compliance', () => {
    const suggestion = suggestCompliantShade('#06C167');
    expect(suggestion).not.toBeNull();
    if (suggestion) {
      expect(validateBrandPrimary(suggestion).valid).toBe(true);
    }
  });

  it('returns the input unchanged when already compliant', () => {
    const suggestion = suggestCompliantShade('#1A1A1A');
    expect(suggestion).toBe('#1A1A1A');
  });

  it('returns null for invalid input', () => {
    expect(suggestCompliantShade('invalid')).toBeNull();
  });
});
