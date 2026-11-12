import { describe, it, expect } from 'vitest';
import { phoneSchema } from '../common.schema';

describe('phoneSchema', () => {
  it.each(['+226 70 12 34 56', '70123456', '(+237) 6-99-12-34', ''])('accepts %s', (v) => {
    expect(phoneSchema.safeParse(v).success).toBe(true);
  });

  it.each(['abc', '12345', '70 12 34 56 x', '+226 70 12 34 56 78 90 12'])('rejects %s', (v) => {
    expect(phoneSchema.safeParse(v).success).toBe(false);
  });

  it('trims surrounding spaces', () => {
    expect(phoneSchema.parse('  70123456 ')).toBe('70123456');
  });
});
