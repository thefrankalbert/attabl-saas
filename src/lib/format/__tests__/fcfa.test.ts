import { describe, it, expect } from 'vitest';
import { formatFCFA } from '../fcfa';

describe('formatFCFA', () => {
  it('formats zero', () => {
    expect(formatFCFA(0)).toBe('0\u00A0FCFA');
  });

  it('formats amount under 1000 without separator', () => {
    expect(formatFCFA(500)).toBe('500\u00A0FCFA');
  });

  it('formats amount with thousands separator (NBSP)', () => {
    expect(formatFCFA(8500)).toBe('8\u00A0500\u00A0FCFA');
  });

  it('formats large amounts with multiple NBSP separators', () => {
    expect(formatFCFA(12345678)).toBe('12\u00A0345\u00A0678\u00A0FCFA');
  });

  it('rounds decimal amounts to the nearest integer', () => {
    expect(formatFCFA(8499.7)).toBe('8\u00A0500\u00A0FCFA');
    expect(formatFCFA(8500.4)).toBe('8\u00A0500\u00A0FCFA');
  });

  it('handles negative amounts with leading minus sign', () => {
    expect(formatFCFA(-1500)).toBe('-1\u00A0500\u00A0FCFA');
  });

  it('never falls back to thin space (U+2009)', () => {
    expect(formatFCFA(1000)).not.toContain('\u2009');
  });
});
