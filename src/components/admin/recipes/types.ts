export interface MenuItem {
  id: string;
  name: string;
  category_id: string | null;
  is_available: boolean;
}

export interface RecipeLine {
  lineId: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity_needed: number | string;
  notes: string;
}

export type RecipeFilter = 'all' | 'with' | 'without';

export const EMPTY_RECIPE_IDS = new Set<string>();

export function newLineId(): string {
  return `line-${crypto.randomUUID()}`;
}

export function parseQuantity(value: number | string): number {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
