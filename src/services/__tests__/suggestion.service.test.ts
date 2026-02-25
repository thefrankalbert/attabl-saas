import { describe, it, expect } from 'vitest';
import { generateSuggestions } from '../suggestion.service';

const makeItem = (id: string, name: string, price: number, categoryId: string) => ({
  id,
  name,
  price,
  category_id: categoryId,
  is_available: true,
});

describe('generateSuggestions', () => {
  it('returns empty array for empty input', () => {
    expect(generateSuggestions([])).toEqual([]);
  });

  it('generates upsell for 20-50% more expensive in same category', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Premium Burger', 1300, 'cat1'),
    ];
    const result = generateSuggestions(items);
    const upsells = result.filter((s) => s.suggestion_type === 'upsell');
    expect(upsells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          menu_item_id: 'a',
          suggested_item_id: 'b',
          suggestion_type: 'upsell',
        }),
      ]),
    );
  });

  it('does NOT generate upsell if price diff < 20%', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Similar Burger', 1100, 'cat1'),
    ];
    const result = generateSuggestions(items);
    const upsells = result.filter((s) => s.suggestion_type === 'upsell' && s.menu_item_id === 'a');
    expect(upsells).toHaveLength(0);
  });

  it('generates alternative for same category + close price', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Veggie Burger', 1200, 'cat1'),
    ];
    const result = generateSuggestions(items);
    const alts = result.filter((s) => s.suggestion_type === 'alternative');
    expect(alts.length).toBeGreaterThan(0);
  });

  it('generates pairing from different category', () => {
    const items = [
      makeItem('a', 'Steak', 5000, 'mains'),
      makeItem('b', 'Caesar Salad', 2000, 'starters'),
    ];
    const result = generateSuggestions(items);
    const pairings = result.filter((s) => s.suggestion_type === 'pairing');
    expect(pairings.length).toBeGreaterThan(0);
  });

  it('deduplicates same source-target pairs', () => {
    const items = [
      makeItem('a', 'Burger', 1000, 'cat1'),
      makeItem('b', 'Premium Burger', 1250, 'cat1'),
    ];
    const result = generateSuggestions(items);
    const keys = result.map((s) => `${s.menu_item_id}-${s.suggested_item_id}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('skips unavailable items', () => {
    const items = [
      { id: 'a', name: 'Burger', price: 1000, category_id: 'cat1', is_available: true },
      { id: 'b', name: 'Old Burger', price: 1300, category_id: 'cat1', is_available: false },
    ];
    const result = generateSuggestions(items);
    const refs = result.flatMap((s) => [s.menu_item_id, s.suggested_item_id]);
    expect(refs).not.toContain('b');
  });

  it('skips items without category', () => {
    const items = [{ id: 'a', name: 'Misc', price: 1000, category_id: null, is_available: true }];
    expect(generateSuggestions(items)).toEqual([]);
  });
});
