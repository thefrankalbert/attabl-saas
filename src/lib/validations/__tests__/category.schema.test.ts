import { describe, expect, it } from 'vitest';
import { CATEGORY_NAME_MAX, categoryNameEnSchema, categoryNameSchema } from '../category.schema';

describe('categoryNameSchema', () => {
  it('accepte un nom de la longueur maximale (temoin positif)', () => {
    expect(categoryNameSchema.safeParse('a'.repeat(CATEGORY_NAME_MAX)).success).toBe(true);
  });

  it('refuse un nom de 408 caracteres avec un message precis (temoin negatif)', () => {
    const r = categoryNameSchema.safeParse('a'.repeat(408));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Maximum 100 caractères');
  });

  it('refuse un nom vide ou fait d espaces', () => {
    expect(categoryNameSchema.safeParse('   ').success).toBe(false);
  });
});

describe('categoryNameEnSchema', () => {
  it('accepte l absence de nom anglais et refuse plus de 100 caracteres', () => {
    expect(categoryNameEnSchema.safeParse(undefined).success).toBe(true);
    expect(categoryNameEnSchema.safeParse(null).success).toBe(true);
    expect(categoryNameEnSchema.safeParse('b'.repeat(101)).success).toBe(false);
  });
});
