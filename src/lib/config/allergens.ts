/**
 * EU 14 major allergens (Regulation EU No 1169/2011)
 * Used as identifiers stored in menu_items.allergens TEXT[] column.
 */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'tree_nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type AllergenId = (typeof ALLERGENS)[number];
