import { describe, it, expect } from 'vitest';
import { createRestaurantSchema } from '../restaurant.schema';

describe('createRestaurantSchema', () => {
  it('accepts valid step 1 input', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'restaurant',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 2 characters', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'A',
      type: 'restaurant',
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid establishment type', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'nightclub',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase or special characters', () => {
    const result = createRestaurantSchema.safeParse({
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
      const result = createRestaurantSchema.safeParse({
        name: 'Test',
        type,
        slug: 'test',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('createRestaurantSchema: pas de formule choisie par le client', () => {
  it('accepte une demande sans formule', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(true);
  });

  it('retire une formule envoyee par un ancien client au lieu de la transmettre', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
      plan: 'business',
    });
    expect(result.success).toBe(true);
    expect(result.success && 'plan' in result.data).toBe(false);
  });
});
