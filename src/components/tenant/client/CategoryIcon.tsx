import {
  Salad,
  UtensilsCrossed,
  Soup,
  Cookie,
  GlassWater,
  Pizza,
  Beef,
  ChefHat,
  Croissant,
  Wheat,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type CategoryIconKey =
  | 'starter'
  | 'main'
  | 'side'
  | 'dessert'
  | 'drink'
  | 'salad'
  | 'pizza'
  | 'burger'
  | 'asian'
  | 'african'
  | 'pasta'
  | 'bakery';

const MAP: Record<CategoryIconKey, React.ComponentType<LucideProps>> = {
  starter: Salad,
  main: UtensilsCrossed,
  side: Soup,
  dessert: Cookie,
  drink: GlassWater,
  salad: Salad,
  pizza: Pizza,
  burger: Beef,
  asian: Soup,
  african: ChefHat,
  pasta: Wheat,
  bakery: Croissant,
};

export function CategoryIcon({
  name,
  size = 28,
  className = '',
}: {
  name: CategoryIconKey;
  size?: number;
  className?: string;
}) {
  const Cmp = MAP[name] ?? UtensilsCrossed;
  return <Cmp width={size} height={size} strokeWidth={1.6} className={className} />;
}

export const CATEGORY_COLORS: Record<CategoryIconKey, { bg: string; fg: string }> = {
  starter: { bg: 'oklch(0.97 0.02 130)', fg: 'oklch(0.42 0.10 130)' },
  main: { bg: 'oklch(0.97 0.02 50)', fg: 'oklch(0.42 0.10 50)' },
  side: { bg: 'oklch(0.97 0.015 60)', fg: 'oklch(0.42 0.06 60)' },
  dessert: { bg: 'oklch(0.97 0.025 0)', fg: 'oklch(0.45 0.12 0)' },
  drink: { bg: 'oklch(0.96 0.025 230)', fg: 'oklch(0.42 0.10 230)' },
  salad: { bg: 'oklch(0.97 0.025 145)', fg: 'oklch(0.42 0.11 145)' },
  pizza: { bg: 'oklch(0.97 0.02 50)', fg: 'oklch(0.42 0.10 50)' },
  burger: { bg: 'oklch(0.97 0.025 35)', fg: 'oklch(0.45 0.13 35)' },
  asian: { bg: 'oklch(0.97 0.025 75)', fg: 'oklch(0.45 0.10 75)' },
  african: { bg: 'oklch(0.97 0.025 35)', fg: 'oklch(0.45 0.13 35)' },
  pasta: { bg: 'oklch(0.97 0.025 75)', fg: 'oklch(0.45 0.10 75)' },
  bakery: { bg: 'oklch(0.97 0.02 50)', fg: 'oklch(0.42 0.10 50)' },
};

export function getCategoryColors(key: CategoryIconKey): { bg: string; fg: string } {
  return CATEGORY_COLORS[key];
}

export function deriveCategoryIconKey(categoryName: string): CategoryIconKey {
  const lower = categoryName.toLowerCase();
  if (lower.includes('entr')) return 'starter';
  if (lower.includes('dessert') || lower.includes('sucre')) return 'dessert';
  if (
    lower.includes('boisson') ||
    lower.includes('drink') ||
    lower.includes('cocktail') ||
    lower.includes('jus')
  )
    return 'drink';
  if (lower.includes('salade')) return 'salad';
  if (lower.includes('pizza')) return 'pizza';
  if (lower.includes('burger') || lower.includes('sandwich')) return 'burger';
  if (
    lower.includes('asiatique') ||
    lower.includes('sushi') ||
    lower.includes('wok') ||
    lower.includes('noodle')
  )
    return 'asian';
  if (
    lower.includes('african') ||
    lower.includes('africain') ||
    lower.includes('attieke') ||
    lower.includes('aloko') ||
    lower.includes('thieb') ||
    lower.includes('yassa')
  )
    return 'african';
  if (lower.includes('pate') || lower.includes('pasta') || lower.includes('nouille'))
    return 'pasta';
  if (
    lower.includes('viennois') ||
    lower.includes('boulanger') ||
    lower.includes('bakery') ||
    lower.includes('croissant')
  )
    return 'bakery';
  if (
    lower.includes('accomp') ||
    lower.includes('frite') ||
    lower.includes('riz') ||
    lower.includes('side')
  )
    return 'side';
  return 'main';
}
