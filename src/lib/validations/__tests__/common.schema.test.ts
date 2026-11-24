import { describe, expect, it } from 'vitest';
import { parseRouteUuid, passwordSchema, routeUuidSchema } from '../common.schema';

describe('routeUuidSchema', () => {
  it('accepts valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(routeUuidSchema.safeParse(id).success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    expect(routeUuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('parseRouteUuid', () => {
  it('returns parsed id for valid input', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const result = parseRouteUuid(id);
    expect(result).toEqual({ ok: true, id });
  });

  it('returns error for invalid input', () => {
    const result = parseRouteUuid('bad-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalide');
    }
  });
});

// Les regles de la politique Auth (12 caracteres, minuscule, majuscule, chiffre,
// symbole) refusent aussi les suites de chiffres et les mots de passe a moins de
// 4 caracteres distincts: les temoins positifs respectent ces regles.
describe('passwordSchema - mots de passe trop simples', () => {
  it.each(['1234567890123', '9876543210987', 'aaaaaaa1', 'abababa1'])('refuse %s', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(false);
  });

  it.each(['Soleil-Ouaga-2026', 'Maquis!42-Ouaga', 'Riz-Gras-2026!'])('temoin: accepte %s', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(true);
  });
});
