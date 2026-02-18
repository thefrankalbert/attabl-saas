import { describe, it, expect } from 'vitest';
import {
  createRestaurantStep1Schema,
  createRestaurantStep2Schema,
  createRestaurantSchema,
} from '../restaurant.schema';

describe('createRestaurantStep1Schema', () => {
  it('accepts valid step 1 input', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'restaurant',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 2 characters', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'A',
      type: 'restaurant',
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid establishment type', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'nightclub',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase or special characters', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'restaurant',
      slug: 'Le Radisson!',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid establishment types', () => {
    const types = [
      'restaurant',
      'hotel',
      'bar-cafe',
      'boulangerie',
      'dark-kitchen',
      'food-truck',
      'quick-service',
    ];
    for (const type of types) {
      const result = createRestaurantStep1Schema.safeParse({
        name: 'Test',
        type,
        slug: 'test',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('createRestaurantStep2Schema', () => {
  it('accepts trial plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'trial' });
    expect(result.success).toBe(true);
  });

  it('accepts essentiel plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'essentiel' });
    expect(result.success).toBe(true);
  });

  it('accepts premium plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'premium' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'enterprise' });
    expect(result.success).toBe(false);
  });
});

describe('createRestaurantSchema (merged)', () => {
  it('accepts complete valid input', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
      plan: 'premium',
    });
    expect(result.success).toBe(true);
  });

  it('rejects input missing plan', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(false);
  });
});
