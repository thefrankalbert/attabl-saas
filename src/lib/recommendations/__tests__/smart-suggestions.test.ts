import { describe, it, expect } from 'vitest';
import {
  getSmartSuggestions,
  type CartItemInput,
  type MenuItemCandidate,
  type CategoryInput,
} from '../smart-suggestions';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAT_MAIN: CategoryInput = { id: 'cat-main', name: 'Plats principaux' };
const CAT_DRINK: CategoryInput = { id: 'cat-drink', name: 'Boissons' };
const CAT_STARTER: CategoryInput = { id: 'cat-starter', name: 'Entrees' };
const CAT_DESSERT: CategoryInput = { id: 'cat-dessert', name: 'Desserts' };
const CAT_SIDE: CategoryInput = { id: 'cat-side', name: 'Accompagnements' };

const ALL_CATEGORIES = [CAT_MAIN, CAT_DRINK, CAT_STARTER, CAT_DESSERT, CAT_SIDE];

function makeItem(overrides: Partial<MenuItemCandidate> & { id: string }): MenuItemCandidate {
  return {
    name: `Item ${overrides.id}`,
    price: 5000,
    is_available: true,
    rating: 4.0,
    rating_count: 10,
    is_featured: false,
    is_vegetarian: false,
    is_spicy: false,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<CartItemInput> & { id: string }): CartItemInput {
  return {
    price: 5000,
    is_vegetarian: false,
    is_spicy: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getSmartSuggestions', () => {
  describe('empty cart', () => {
    it('returns empty array when cart is empty', () => {
      const menu = [makeItem({ id: 'i1', category_id: CAT_DRINK.id })];
      expect(getSmartSuggestions([], menu, ALL_CATEGORIES)).toEqual([]);
    });
  });

  describe('missing drink detection', () => {
    it('puts drinks first when cart has no drink', () => {
      const cart = [makeCartItem({ id: 'i1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'i1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'drink-1', category_id: CAT_DRINK.id }),
        makeItem({ id: 'dessert-1', category_id: CAT_DESSERT.id }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result[0].item.id).toBe('drink-1');
      expect(result[0].reason).toBe('missing_drink');
    });

    it('does not boost drinks if cart already has one', () => {
      const cart = [
        makeCartItem({ id: 'i1', category_id: CAT_MAIN.id }),
        makeCartItem({ id: 'i2', category_id: CAT_DRINK.id }),
      ];
      const menu = [
        makeItem({ id: 'i1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'i2', category_id: CAT_DRINK.id }),
        makeItem({ id: 'drink-extra', category_id: CAT_DRINK.id }),
        makeItem({ id: 'dessert-1', category_id: CAT_DESSERT.id, rating: 5, rating_count: 100 }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result[0].reason).not.toBe('missing_drink');
    });
  });

  describe('missing starter detection', () => {
    it('suggests starter when cart has main but no starter', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'starter-1', category_id: CAT_STARTER.id }),
        makeItem({ id: 'side-1', category_id: CAT_SIDE.id }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const starterResult = result.find((r) => r.reason === 'missing_starter');
      expect(starterResult).toBeDefined();
      expect(starterResult?.item.id).toBe('starter-1');
    });
  });

  describe('missing dessert detection', () => {
    it('suggests dessert when cart has main but no dessert', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'dessert-1', category_id: CAT_DESSERT.id }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result.some((r) => r.reason === 'missing_dessert')).toBe(true);
    });
  });

  describe('missing side detection', () => {
    it('suggests sides when cart has main', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'side-1', category_id: CAT_SIDE.id }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result.some((r) => r.reason === 'missing_side')).toBe(true);
    });
  });

  describe('spicy cooling boost', () => {
    it('boosts drinks when cart contains spicy items', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id, is_spicy: true })];
      // Same rating for both so only priority bonuses decide the order
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'drink-1', category_id: CAT_DRINK.id, rating: 3.5, rating_count: 5 }),
        makeItem({ id: 'starter-1', category_id: CAT_STARTER.id, rating: 3.5, rating_count: 5 }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      // drink: missing_drink (+8) + spicy (+2) = +10 over starter: missing_starter (+5)
      expect(result[0].item.id).toBe('drink-1');
    });
  });

  describe('vegetarian coherence', () => {
    it('boosts vegetarian items when cart contains vegetarian items', () => {
      const cart = [
        makeCartItem({ id: 'main-veg', category_id: CAT_MAIN.id, is_vegetarian: true }),
      ];
      const veganDessert = makeItem({
        id: 'dessert-veg',
        category_id: CAT_DESSERT.id,
        is_vegetarian: true,
        rating: 3.0,
        rating_count: 5,
      });
      const nonVegDessert = makeItem({
        id: 'dessert-normal',
        category_id: CAT_DESSERT.id,
        is_vegetarian: false,
        rating: 3.0,
        rating_count: 5,
      });
      const menu = [
        makeItem({ id: 'main-veg', category_id: CAT_MAIN.id }),
        // Drink has higher base priority (missing_drink +8) — exclude it to isolate veg test
        veganDessert,
        nonVegDessert,
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const desserts = result.filter((r) => r.item.category_id === CAT_DESSERT.id);
      // vegetarian dessert should score higher than non-vegetarian one
      expect(desserts[0].item.id).toBe('dessert-veg');
    });
  });

  describe('price coherence', () => {
    it('penalises items more than 250% of cart average', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id, price: 5000 })];
      // Same rating so only price penalty decides — expensive loses -3, reasonable gains +2
      const expensive = makeItem({
        id: 'exp-1',
        category_id: CAT_DESSERT.id,
        price: 20000,
        rating: 4.0,
        rating_count: 10,
      });
      const reasonable = makeItem({
        id: 'rea-1',
        category_id: CAT_DESSERT.id,
        price: 5000,
        rating: 4.0,
        rating_count: 10,
      });
      const menu = [makeItem({ id: 'main-1', category_id: CAT_MAIN.id }), expensive, reasonable];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const desserts = result.filter((r) => r.item.category_id === CAT_DESSERT.id);
      // reasonable: base + missing_dessert(+4) + in_range(+2) beats expensive: base + missing_dessert(+4) - penalty(-3)
      expect(desserts[0].item.id).toBe('rea-1');
    });

    it('boosts items within 60%-160% of cart average price', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id, price: 5000 })];
      const inRange = makeItem({
        id: 'in-range',
        category_id: CAT_DESSERT.id,
        price: 6000,
        rating: 3.5,
        rating_count: 5,
      });
      const outOfRange = makeItem({
        id: 'out-range',
        category_id: CAT_DESSERT.id,
        price: 400,
        rating: 3.5,
        rating_count: 5,
      });
      const menu = [makeItem({ id: 'main-1', category_id: CAT_MAIN.id }), inRange, outOfRange];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const desserts = result.filter((r) => r.item.category_id === CAT_DESSERT.id);
      expect(desserts[0].item.id).toBe('in-range');
    });
  });

  describe('featured bonus', () => {
    it('boosts featured items above equally-rated non-featured', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const featured = makeItem({
        id: 'feat-1',
        category_id: CAT_DESSERT.id,
        is_featured: true,
        rating: 3.5,
        rating_count: 10,
      });
      const normal = makeItem({
        id: 'norm-1',
        category_id: CAT_DESSERT.id,
        is_featured: false,
        rating: 3.5,
        rating_count: 10,
      });
      const menu = [makeItem({ id: 'main-1', category_id: CAT_MAIN.id }), normal, featured];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const desserts = result.filter((r) => r.item.category_id === CAT_DESSERT.id);
      expect(desserts[0].item.id).toBe('feat-1');
    });
  });

  describe('rating-based ordering', () => {
    it('ranks higher-rated items above lower-rated in same priority tier', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const lowRated = makeItem({
        id: 'drink-low',
        category_id: CAT_DRINK.id,
        rating: 2.5,
        rating_count: 5,
      });
      const highRated = makeItem({
        id: 'drink-high',
        category_id: CAT_DRINK.id,
        rating: 4.8,
        rating_count: 50,
      });
      const menu = [makeItem({ id: 'main-1', category_id: CAT_MAIN.id }), lowRated, highRated];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const drinks = result.filter((r) => r.item.category_id === CAT_DRINK.id);
      expect(drinks[0].item.id).toBe('drink-high');
    });
  });

  describe('cart items excluded', () => {
    it('never suggests an item already in the cart', () => {
      const cart = [makeCartItem({ id: 'drink-1', category_id: CAT_DRINK.id })];
      const menu = [makeItem({ id: 'drink-1', category_id: CAT_DRINK.id })];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result.find((r) => r.item.id === 'drink-1')).toBeUndefined();
    });
  });

  describe('unavailable items excluded', () => {
    it('never suggests unavailable items', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'drink-off', category_id: CAT_DRINK.id, is_available: false }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      expect(result.find((r) => r.item.id === 'drink-off')).toBeUndefined();
    });
  });

  describe('maxResults', () => {
    it('respects maxResults limit', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        ...Array.from({ length: 20 }, (_, i) =>
          makeItem({ id: `item-${i}`, category_id: CAT_DRINK.id }),
        ),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES, 4);
      expect(result.length).toBeLessThanOrEqual(4);
    });
  });

  describe('priority order', () => {
    it('drink > starter > dessert > side when all are missing', () => {
      const cart = [makeCartItem({ id: 'main-1', category_id: CAT_MAIN.id })];
      const menu = [
        makeItem({ id: 'main-1', category_id: CAT_MAIN.id }),
        makeItem({ id: 'drink-1', category_id: CAT_DRINK.id, rating: 3, rating_count: 1 }),
        makeItem({ id: 'starter-1', category_id: CAT_STARTER.id, rating: 3, rating_count: 1 }),
        makeItem({ id: 'dessert-1', category_id: CAT_DESSERT.id, rating: 3, rating_count: 1 }),
        makeItem({ id: 'side-1', category_id: CAT_SIDE.id, rating: 3, rating_count: 1 }),
      ];
      const result = getSmartSuggestions(cart, menu, ALL_CATEGORIES);
      const reasons = result.map((r) => r.reason);
      expect(reasons[0]).toBe('missing_drink');
      expect(reasons[1]).toBe('missing_starter');
      expect(reasons[2]).toBe('missing_dessert');
      expect(reasons[3]).toBe('missing_side');
    });
  });
});
