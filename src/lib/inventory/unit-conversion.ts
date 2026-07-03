/**
 * Pure purchase-unit -> base-unit conversion for the stock ledger.
 *
 * The ledger (stock_movements) is ALWAYS in the ingredient's base unit. When a
 * restaurant records a purchase in a buying unit (casier, sac, carton, or an SI
 * unit like g/cl), we convert to the base unit HERE, before the ledger write,
 * so the "always base unit" invariant and the reconcilable ledger stay intact.
 *
 * No dependency: only two SI pairs exist in the current IngredientUnit enum
 * (g<->kg mass, cl<->L volume). A tiny internal factor map covers them; any
 * other purchase unit is a count unit converted via units_per_purchase.
 *
 * Pure module: no Supabase, no Next imports.
 */

import type { IngredientUnit } from '@/types/inventory.types';

// Base-unit-per-unit factors, grouped by physical dimension. Converting a
// quantity q expressed in unit A to unit B (same dimension) is:
//   q * FACTOR[A] / FACTOR[B]
// e.g. 500 g -> kg: 500 * 1 / 1000 = 0.5.
const SI_FACTORS: Record<string, { dimension: 'mass' | 'volume'; perBase: number }> = {
  // mass, base = g
  g: { dimension: 'mass', perBase: 1 },
  kg: { dimension: 'mass', perBase: 1000 },
  // volume, base = cl
  cl: { dimension: 'volume', perBase: 1 },
  L: { dimension: 'volume', perBase: 100 },
};

/**
 * True when both labels are SI-known AND share the same physical dimension
 * (both mass, or both volume). Gates the SI branch strictly so a mislabeled
 * purchase unit (e.g. 'g' on a non-mass base) never cross-converts and instead
 * falls back to the units_per_purchase count path.
 */
export function isSiConvertible(a: string, b: string): boolean {
  const fa = SI_FACTORS[a];
  const fb = SI_FACTORS[b];
  return fa != null && fb != null && fa.dimension === fb.dimension;
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export interface ConvertToBaseUnitInput {
  quantity: number;
  baseUnit: IngredientUnit;
  purchaseUnit: string | null;
  unitsPerPurchase: number;
}

/**
 * Convert a purchased quantity into the ingredient's base unit, rounded to 3
 * decimals (matches ingredients.current_stock NUMERIC(10,3) so the ledger
 * invariant SUM(movements) == current_stock holds).
 *
 * - purchaseUnit null or === baseUnit -> identity (quantity).
 * - both units SI-known and same dimension -> SI factor conversion.
 * - otherwise (casier / sac / carton / bouteille / piece) -> quantity * unitsPerPurchase.
 *
 * @throws RangeError if quantity < 0 or unitsPerPurchase <= 0.
 */
export function convertToBaseUnit({
  quantity,
  baseUnit,
  purchaseUnit,
  unitsPerPurchase,
}: ConvertToBaseUnitInput): number {
  if (quantity < 0) {
    throw new RangeError('quantity must be >= 0');
  }
  if (!(unitsPerPurchase > 0)) {
    throw new RangeError('unitsPerPurchase must be > 0');
  }

  if (purchaseUnit == null || purchaseUnit === baseUnit) {
    return round3(quantity);
  }

  if (isSiConvertible(purchaseUnit, baseUnit)) {
    const converted = (quantity * SI_FACTORS[purchaseUnit].perBase) / SI_FACTORS[baseUnit].perBase;
    return round3(converted);
  }

  return round3(quantity * unitsPerPurchase);
}
