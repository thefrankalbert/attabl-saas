/**
 * Menu-based recommendation engine.
 *
 * Pure function — no DB calls, no React deps.
 * Works entirely from the menu data already loaded in memory.
 *
 * Scoring model (additive):
 *   base     = rating * log(rating_count + 2)   — quality signal
 *   +8       = missing drink detected in cart
 *   +5       = missing starter (cart has a main)
 *   +4       = missing dessert (cart has a main)
 *   +3       = missing side (cart has a main)
 *   +2       = dietary coherence (cart has veg items, candidate is veg)
 *   +2       = spicy cooling (cart has spicy, candidate is a drink)
 *   +2       = price in range [60%-160%] of cart average
 *   +1.5     = item is featured
 *   -3       = price > 250% of cart average (over-priced for context)
 */

export type SuggestionReason =
  | 'missing_drink'
  | 'missing_starter'
  | 'missing_dessert'
  | 'missing_side'
  | 'complement'
  | 'popular';

export interface CartItemInput {
  id: string;
  category_id?: string | null;
  price: number;
  is_vegetarian?: boolean | null;
  is_spicy?: boolean | null;
}

export interface MenuItemCandidate {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  prices?: Record<string, number> | null;
  image_url?: string | null;
  category_id?: string | null;
  is_available: boolean;
  is_featured?: boolean | null;
  is_vegetarian?: boolean | null;
  is_spicy?: boolean | null;
  rating?: number | null;
  rating_count?: number | null;
}

export interface CategoryInput {
  id: string;
  name: string;
}

export interface SmartSuggestion {
  item: MenuItemCandidate;
  reason: SuggestionReason;
  score: number;
}

type MealComponent = 'drink' | 'starter' | 'main' | 'dessert' | 'side' | 'other';

const DRINK_RE =
  /boisson|drink|cocktail|\bvin\b|bi[eè]re|beer|jus\b|\beau\b|soft\b|soda|caf[eé]|coffee|th[eé]\b|\btea\b|alcool|ap[eé]ritif|champagne|smoothie|milkshake/i;

const STARTER_RE =
  /entr[eé]e|starter|soupe|salade|salad|appetizer|amuse.bouche|velout[eé]|tartare|carpaccio/i;

const DESSERT_RE =
  /dessert|douceur|sucr[eé]|sweet|glace|p[aâ]tisserie|g[aâ]teau|fondant|\btarte\b|cr[eê]pe|tiramisu/i;

const SIDE_RE = /accompagnement|side|garniture|frites|riz\b|l[eé]gume|sauce\b|\bpain\b|\bbread\b/i;

const MAIN_RE =
  /plat|main|viande|meat|poisson|fish|pasta|p[aâ]tes|burger|pizza|poulet|chicken|agneau|lamb|boeuf|beef/i;

function classifyCategory(name: string): MealComponent {
  if (DRINK_RE.test(name)) return 'drink';
  if (STARTER_RE.test(name)) return 'starter';
  if (DESSERT_RE.test(name)) return 'dessert';
  if (SIDE_RE.test(name)) return 'side';
  if (MAIN_RE.test(name)) return 'main';
  return 'other';
}

function computeRatingScore(item: MenuItemCandidate): number {
  const rating = item.rating ?? 3.5;
  const count = item.rating_count ?? 0;
  // log(count + 2) so an item with 0 reviews still gets a baseline > 0
  return rating * Math.log(count + 2);
}

export function getSmartSuggestions(
  cartItems: CartItemInput[],
  allMenuItems: MenuItemCandidate[],
  allCategories: CategoryInput[],
  maxResults = 6,
): SmartSuggestion[] {
  if (cartItems.length === 0) return [];

  // Build category lookup
  const categoryMap = new Map<string, MealComponent>();
  for (const cat of allCategories) {
    categoryMap.set(cat.id, classifyCategory(cat.name));
  }

  // Analyse what's already in the cart
  const cartIds = new Set(cartItems.map((i) => i.id));
  const cartTypes = new Set<MealComponent>();
  let totalPrice = 0;
  let hasVegetarian = false;
  let hasSpicy = false;

  for (const item of cartItems) {
    totalPrice += item.price;
    if (item.is_vegetarian) hasVegetarian = true;
    if (item.is_spicy) hasSpicy = true;
    if (item.category_id) {
      const t = categoryMap.get(item.category_id);
      if (t) cartTypes.add(t);
    }
  }

  const avgPrice = totalPrice / cartItems.length;
  const hasDrink = cartTypes.has('drink');
  const hasStarter = cartTypes.has('starter');
  const hasDessert = cartTypes.has('dessert');
  const hasMain = cartTypes.has('main') || cartTypes.has('other');

  // Candidates: available items not already in cart
  const candidates = allMenuItems.filter((m) => m.is_available && !cartIds.has(m.id));

  const scored: SmartSuggestion[] = candidates.map((item) => {
    let score = computeRatingScore(item);
    let reason: SuggestionReason = 'popular';

    const itemType = item.category_id ? (categoryMap.get(item.category_id) ?? 'other') : 'other';

    // Missing meal component — highest priority signals
    if (!hasDrink && itemType === 'drink') {
      score += 8;
      reason = 'missing_drink';
    } else if (!hasStarter && hasMain && itemType === 'starter') {
      score += 5;
      reason = 'missing_starter';
    } else if (!hasDessert && hasMain && itemType === 'dessert') {
      score += 4;
      reason = 'missing_dessert';
    } else if (hasMain && itemType === 'side') {
      score += 3;
      reason = 'missing_side';
    } else {
      reason = 'complement';
    }

    // Dietary coherence
    if (hasVegetarian && item.is_vegetarian) score += 2;

    // Spicy cooling: boost drinks when cart has spicy items
    if (hasSpicy && itemType === 'drink') score += 2;

    // Price coherence
    if (item.price > avgPrice * 2.5) {
      score -= 3;
    } else if (item.price >= avgPrice * 0.6 && item.price <= avgPrice * 1.6) {
      score += 2;
    }

    // Featured bonus
    if (item.is_featured) score += 1.5;

    return { item, reason, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
