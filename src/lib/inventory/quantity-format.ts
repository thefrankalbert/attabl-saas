/**
 * Quantites de stock: la base stocke 3 decimales (numeric(10,3)). Les calculs en
 * virgule flottante (12 - 13.225) donnent des queues comme -1.2249999999999996:
 * on arrondit AVANT d'afficher ou de comparer.
 */

/** Plus grande quantite acceptee par la colonne numeric(10,3). */
export const MAX_STOCK_QUANTITY = 9_999_999;

/**
 * Plus grand prix d'achat accepte a la reception: la colonne du cout
 * (ingredients.cost_per_unit, numeric(10,2)) va jusqu'a 99 999 999.99.
 */
export const MAX_UNIT_COST = 99_999_999;

/** Arrondit a 3 decimales (ecarts de calcul flottant, jamais de -0). */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/** Texte d'une quantite: 3 decimales au plus, sans zeros inutiles ("12", "0.123"). */
export function formatQuantity(value: number): string {
  return String(roundQuantity(value));
}
