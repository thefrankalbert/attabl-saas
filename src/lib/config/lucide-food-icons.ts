import {
  Salad,
  Beef,
  Fish,
  Pizza,
  Sandwich,
  Coffee,
  Wine,
  GlassWater,
  Beer,
  Cookie,
  IceCream2,
  CakeSlice,
  Soup,
  ChefHat,
  UtensilsCrossed,
  Utensils,
  Flame,
  Drumstick,
  Egg,
  Apple,
  Carrot,
  Wheat,
  Croissant,
  Leaf,
  Grape,
  Citrus,
  Milk,
  Star,
  Globe,
  Popcorn,
  Candy,
  CupSoda,
  Martini,
  Ham,
  Cherry,
  Nut,
  Sunrise,
  Moon,
  ShoppingBag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface FoodIcon {
  name: string;
  component: LucideIcon;
  keywords: string[];
}

export const FOOD_ICONS: FoodIcon[] = [
  {
    name: 'Salad',
    component: Salad,
    keywords: ['salade', 'salad', 'entree', 'starter', 'vegetarien', 'vegan', 'crudites', 'frais'],
  },
  {
    name: 'UtensilsCrossed',
    component: UtensilsCrossed,
    keywords: ['plat', 'main', 'principal', 'course', 'repas'],
  },
  {
    name: 'Beef',
    component: Beef,
    keywords: ['viande', 'boeuf', 'beef', 'steak', 'grillade', 'grill', 'bbq', 'brochette'],
  },
  {
    name: 'Fish',
    component: Fish,
    keywords: ['poisson', 'fish', 'seafood', 'fruits de mer', 'crevette', 'saumon'],
  },
  {
    name: 'Drumstick',
    component: Drumstick,
    keywords: ['poulet', 'chicken', 'volaille', 'dinde', 'turkey', 'halal'],
  },
  {
    name: 'Ham',
    component: Ham,
    keywords: ['porc', 'pork', 'jambon', 'charcuterie', 'kebab'],
  },
  {
    name: 'Pizza',
    component: Pizza,
    keywords: ['pizza', 'italienne', 'italian'],
  },
  {
    name: 'Sandwich',
    component: Sandwich,
    keywords: ['sandwich', 'burger', 'panini', 'wrap', 'snack', 'rapide', 'fast'],
  },
  {
    name: 'Soup',
    component: Soup,
    keywords: ['soupe', 'soup', 'bouillon', 'potage', 'consomme'],
  },
  {
    name: 'Egg',
    component: Egg,
    keywords: ['oeuf', 'egg', 'brunch', 'petit dejeuner', 'breakfast', 'omelette'],
  },
  {
    name: 'Croissant',
    component: Croissant,
    keywords: ['viennoiserie', 'boulangerie', 'bakery', 'pain', 'pastry'],
  },
  {
    name: 'CakeSlice',
    component: CakeSlice,
    keywords: ['gateau', 'cake', 'patisserie', 'sucre', 'tarte', 'dessert'],
  },
  {
    name: 'Cookie',
    component: Cookie,
    keywords: ['biscuit', 'cookie', 'confiserie', 'gourmandise', 'petit four'],
  },
  {
    name: 'IceCream2',
    component: IceCream2,
    keywords: ['glace', 'ice cream', 'sorbet', 'frozen'],
  },
  {
    name: 'Candy',
    component: Candy,
    keywords: ['bonbon', 'candy', 'sucrerie', 'chocolat'],
  },
  {
    name: 'Coffee',
    component: Coffee,
    keywords: ['cafe', 'coffee', 'espresso', 'cappuccino', 'the', 'tea', 'chaud', 'hot'],
  },
  {
    name: 'CupSoda',
    component: CupSoda,
    keywords: ['soda', 'jus', 'juice', 'boisson', 'drink', 'soft', 'froid', 'cola'],
  },
  {
    name: 'GlassWater',
    component: GlassWater,
    keywords: ['eau', 'water', 'mineral', 'boissons', 'beverages', 'drinks'],
  },
  {
    name: 'Wine',
    component: Wine,
    keywords: ['vin', 'wine', 'rouge', 'blanc', 'rose', 'alcool', 'bouteille'],
  },
  {
    name: 'Beer',
    component: Beer,
    keywords: ['biere', 'beer', 'pression', 'blonde', 'brune'],
  },
  {
    name: 'Martini',
    component: Martini,
    keywords: ['cocktail', 'mocktail', 'aperitif', 'alcoolise', 'sans alcool', 'mixologie', 'bar'],
  },
  {
    name: 'Grape',
    component: Grape,
    keywords: ['raisin', 'grape', 'vigne'],
  },
  {
    name: 'Citrus',
    component: Citrus,
    keywords: ['citron', 'orange', 'citrus', 'agrume', 'limonade'],
  },
  {
    name: 'Cherry',
    component: Cherry,
    keywords: ['cerise', 'cherry', 'baies', 'fruits rouges'],
  },
  {
    name: 'Apple',
    component: Apple,
    keywords: ['pomme', 'apple', 'fruit', 'frais'],
  },
  {
    name: 'Carrot',
    component: Carrot,
    keywords: ['carotte', 'carrot', 'legume', 'vegetable'],
  },
  {
    name: 'Leaf',
    component: Leaf,
    keywords: ['vegan', 'vegetarien', 'bio', 'nature', 'vert', 'ecolo', 'veggie'],
  },
  {
    name: 'Wheat',
    component: Wheat,
    keywords: ['ble', 'wheat', 'cereale', 'pates', 'pasta', 'farine'],
  },
  {
    name: 'Milk',
    component: Milk,
    keywords: ['lait', 'milk', 'dairy', 'fromage', 'cheese'],
  },
  {
    name: 'Nut',
    component: Nut,
    keywords: ['noix', 'nut', 'amande', 'cacahuete', 'apero', 'grignotage'],
  },
  {
    name: 'Popcorn',
    component: Popcorn,
    keywords: ['popcorn', 'mais', 'snacks', 'cinema'],
  },
  {
    name: 'Flame',
    component: Flame,
    keywords: ['feu', 'flame', 'bbq', 'grille', 'piment', 'epice'],
  },
  {
    name: 'ChefHat',
    component: ChefHat,
    keywords: ['chef', 'specialite', 'signature', 'maison', 'gastronomie', 'recommande'],
  },
  {
    name: 'Utensils',
    component: Utensils,
    keywords: ['general', 'divers', 'autre', 'formule', 'menu', 'plat du jour'],
  },
  {
    name: 'Star',
    component: Star,
    keywords: ['star', 'populaire', 'bestseller', 'coup de coeur', 'incontournable', 'top'],
  },
  {
    name: 'Globe',
    component: Globe,
    keywords: ['international', 'mondial', 'world', 'asiatique', 'africain', 'indien', 'mexicain'],
  },
  {
    name: 'ShoppingBag',
    component: ShoppingBag,
    keywords: ['emporter', 'takeaway', 'takeout', 'livraison', 'delivery'],
  },
  {
    name: 'Sunrise',
    component: Sunrise,
    keywords: ['petit dejeuner', 'breakfast', 'matin', 'morning'],
  },
  {
    name: 'Moon',
    component: Moon,
    keywords: ['diner', 'dinner', 'soir', 'evening', 'nuit'],
  },
];

/**
 * Suggest the best matching icon for a category name.
 * Returns the icon name string or null if no match.
 */
export function suggestIconForName(name: string): string | null {
  if (!name.trim()) return null;
  const lower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let best: string | null = null;
  let bestScore = 0;

  for (const icon of FOOD_ICONS) {
    for (const kw of icon.keywords) {
      const kwNorm = kw.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (lower.includes(kwNorm) || kwNorm.includes(lower)) {
        const score = kwNorm.length;
        if (score > bestScore) {
          bestScore = score;
          best = icon.name;
        }
      }
    }
  }

  return best;
}

/**
 * Get the Lucide component for a stored icon name.
 * Falls back to UtensilsCrossed for unknown names.
 */
export function getLucideIcon(name: string | null | undefined): LucideIcon {
  if (!name) return UtensilsCrossed;
  return FOOD_ICONS.find((i) => i.name === name)?.component ?? UtensilsCrossed;
}
