import { describe, it, expect } from 'vitest';
import { createOrderSchema, orderItemSchema } from '../order.schema';

describe('orderItemSchema', () => {
  const validItem = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Pizza Margherita',
    price: 12.5,
    quantity: 2,
  };

  it('should accept a valid order item', () => {
    const result = orderItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('should reject missing id', () => {
    const result = orderItemSchema.safeParse({ ...validItem, id: undefined });
    expect(result.success).toBe(false);
  });

  it('should reject non-UUID id', () => {
    const result = orderItemSchema.safeParse({ ...validItem, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = orderItemSchema.safeParse({ ...validItem, name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject name exceeding 200 characters', () => {
    const result = orderItemSchema.safeParse({ ...validItem, name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('should reject negative price', () => {
    const result = orderItemSchema.safeParse({ ...validItem, price: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject zero quantity', () => {
    const result = orderItemSchema.safeParse({ ...validItem, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject quantity over 100', () => {
    const result = orderItemSchema.safeParse({ ...validItem, quantity: 101 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer quantity', () => {
    const result = orderItemSchema.safeParse({ ...validItem, quantity: 1.5 });
    expect(result.success).toBe(false);
  });

  it('should accept optional fields', () => {
    const result = orderItemSchema.safeParse({
      ...validItem,
      name_en: 'Pizza Margherita',
      category_name: 'Pizzas',
      selectedOption: { name_fr: 'Extra fromage' },
      selectedVariant: { name_fr: 'Grande', price: 15 },
    });
    expect(result.success).toBe(true);
  });

  it('should reject selectedVariant with negative price', () => {
    const result = orderItemSchema.safeParse({
      ...validItem,
      selectedVariant: { name_fr: 'Grande', price: -5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('createOrderSchema', () => {
  const validItem = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Pizza',
    price: 10,
    quantity: 1,
  };

  it('should accept a valid order', () => {
    const result = createOrderSchema.safeParse({
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty items array', () => {
    const result = createOrderSchema.safeParse({
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...validItem,
      id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
    }));
    const result = createOrderSchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it('should accept optional notes', () => {
    const result = createOrderSchema.safeParse({
      items: [validItem],
      notes: 'Sans oignons',
    });
    expect(result.success).toBe(true);
  });

  it('should reject notes exceeding 500 characters', () => {
    const result = createOrderSchema.safeParse({
      items: [validItem],
      notes: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional customer details', () => {
    const result = createOrderSchema.safeParse({
      items: [validItem],
      tableNumber: '12',
      customerName: 'Jean Dupont',
      customerPhone: '+33612345678',
    });
    expect(result.success).toBe(true);
  });

  it('should reject tableNumber exceeding 10 characters', () => {
    const result = createOrderSchema.safeParse({
      items: [validItem],
      tableNumber: 'a'.repeat(11),
    });
    expect(result.success).toBe(false);
  });
});
