import { describe, it, expect } from 'vitest';
import { menuItemCreateSchema, menuItemUpdateSchema } from '@/lib/validations/menu-item.schema';

const validCategoryId = '11111111-1111-4111-8111-111111111111';

const validCreate = {
  name: 'Poulet Yassa',
  name_en: 'Yassa Chicken',
  description: 'Poulet marine au citron',
  description_en: null,
  price: 3500,
  category_id: validCategoryId,
  image_url: 'https://cdn.attabl.com/x.jpg',
  is_available: true,
  is_featured: false,
  allergens: ['gluten'],
  calories: 620,
};

describe('menuItemCreateSchema', () => {
  it('accepts a valid create payload', () => {
    const result = menuItemCreateSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it('accepts the multi-currency prices map', () => {
    const result = menuItemCreateSchema.safeParse({
      ...validCreate,
      prices: { XOF: 3500, EUR: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const noName: Record<string, unknown> = { ...validCreate };
    delete noName.name;
    const result = menuItemCreateSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = menuItemCreateSchema.safeParse({ ...validCreate, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative price', () => {
    const result = menuItemCreateSchema.safeParse({ ...validCreate, price: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid category_id', () => {
    const result = menuItemCreateSchema.safeParse({ ...validCreate, category_id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys (id, tenant_id, rating) - no mass assignment', () => {
    const result = menuItemCreateSchema.safeParse({
      ...validCreate,
      id: 'evil',
      tenant_id: 'other-tenant',
      rating: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('tenant_id');
      expect(result.data).not.toHaveProperty('rating');
    }
  });
});

describe('menuItemUpdateSchema', () => {
  it('accepts a partial update (price only)', () => {
    const result = menuItemUpdateSchema.safeParse({ price: 4000 });
    expect(result.success).toBe(true);
  });

  it('accepts an update without category_id (menu-detail edit modal)', () => {
    const result = menuItemUpdateSchema.safeParse({
      name: 'Nouveau nom',
      description: undefined,
      price: 4000,
      is_available: true,
      image_url: null,
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a negative price on update', () => {
    const result = menuItemUpdateSchema.safeParse({ price: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts an empty update payload', () => {
    const result = menuItemUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
