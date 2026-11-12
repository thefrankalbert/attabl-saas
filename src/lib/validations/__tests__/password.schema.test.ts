import { describe, it, expect } from 'vitest';
import { passwordSchema } from '../common.schema';

describe('passwordSchema', () => {
  it.each(['Maquis2026', 'riz-gras-chez-awa', 'K7#pmw2x'])('accepts %s', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    ['motdepasse', 'no digit or symbol'],
    ['Motdepasse123', 'too common'],
    ['azerty123', 'too common'],
    ['abc1', 'too short'],
  ])('rejects %s (%s)', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(false);
  });
});
