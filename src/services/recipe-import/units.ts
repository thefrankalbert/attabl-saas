import { normalizeHeader } from '@/lib/excel-parse';
import type { IngredientUnit } from '@/types/inventory.types';

/** Units offered in the Excel dropdown, in the order a restaurateur reads them. */
export const RECIPE_UNITS: IngredientUnit[] = ['kg', 'g', 'L', 'cl', 'pièce', 'bouteille'];

// Map a normalized unit label to the DB enum value. The 'pièce' target keeps the
// accented literal used by the ingredients.unit CHECK (data, not punctuation).
const UNIT_ALIASES: Record<string, IngredientUnit> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogramme: 'kg',
  kilogrammes: 'kg',
  g: 'g',
  gr: 'g',
  gramme: 'g',
  grammes: 'g',
  l: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  cl: 'cl',
  centilitre: 'cl',
  centilitres: 'cl',
  piece: 'pièce',
  pieces: 'pièce',
  pcs: 'pièce',
  pc: 'pièce',
  unite: 'pièce',
  unites: 'pièce',
  bouteille: 'bouteille',
  bouteilles: 'bouteille',
  bottle: 'bouteille',
  btl: 'bouteille',
};

export function mapUnit(raw: unknown): IngredientUnit | null {
  if (raw == null) return null;
  const normalized = normalizeHeader(String(raw));
  return UNIT_ALIASES[normalized] ?? null;
}

// Same-nature units convert through a base unit (g for mass, cl for volume).
// pièce and bouteille only convert to themselves.
const TO_BASE: Partial<Record<IngredientUnit, { base: string; factor: number }>> = {
  kg: { base: 'mass', factor: 1000 },
  g: { base: 'mass', factor: 1 },
  L: { base: 'volume', factor: 100 },
  cl: { base: 'volume', factor: 1 },
};

/**
 * Convert a quantity written in `from` into the ingredient's stock unit `to`.
 * Returns null when the units are of different nature (kg vs piece): the row is
 * then rejected, because silently keeping the number would destock the wrong
 * amount at every sale (50 "g" read as 50 kg).
 */
export function convertQuantity(
  quantity: number,
  from: IngredientUnit,
  to: IngredientUnit,
): number | null {
  if (from === to) return quantity;
  const a = TO_BASE[from];
  const b = TO_BASE[to];
  if (!a || !b || a.base !== b.base) return null;
  // Round away binary noise (0.05 kg -> 50 g must stay 50, not 50.00000000001).
  return Math.round(((quantity * a.factor) / b.factor) * 1e6) / 1e6;
}
