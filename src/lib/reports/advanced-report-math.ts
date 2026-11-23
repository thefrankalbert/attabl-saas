import { multiplyMinor, sumMinor, toMinorUnits } from '@/lib/utils/money';
import type { CurrencyCode } from '@/types/admin.types';

/**
 * Calculs des rapports avances, en unites mineures entieres (dinero).
 * Les couts de fiche arrivent en unites MAJEURES (ingredients.cost_per_unit):
 * ils sont convertis dans la devise du restaurant avant tout calcul.
 */

export interface DishMarginInput {
  quantity: number;
  /** Unites mineures. */
  revenue: number;
  hasRecipe: boolean;
  costComplete: boolean;
  /** Unites majeures, null sans fiche. */
  unitCost: number | null;
}

export interface DishMarginResult {
  /** Cout matiere total des portions vendues, unites mineures; null sans fiche. */
  cost: number | null;
  /** Ventes moins cout matiere, unites mineures; null sans fiche. */
  margin: number | null;
  /** Marge en pourcentage des ventes, arrondie a l'unite; null si non calculable. */
  marginPct: number | null;
}

export function computeDishMargin(
  row: DishMarginInput,
  currency: CurrencyCode | string,
): DishMarginResult {
  if (!row.hasRecipe || row.unitCost === null) {
    return { cost: null, margin: null, marginPct: null };
  }
  const cost = multiplyMinor(toMinorUnits(row.unitCost, currency), row.quantity, currency);
  const margin = sumMinor([row.revenue, -cost], currency);
  return {
    cost,
    margin,
    marginPct: row.revenue > 0 ? Math.round((margin / row.revenue) * 100) : null,
  };
}

export interface MarginTotals {
  /** Ventes des plats dont la fiche est complete (unites mineures). */
  coveredRevenue: number;
  /** Marge de ces plats (unites mineures). */
  margin: number;
  /** Part des ventes couverte par une fiche complete, en pourcentage. */
  coveragePct: number;
}

/** Totaux sur les seuls plats a fiche complete: un cout manquant ne fausse pas la marge. */
export function computeMarginTotals(
  rows: DishMarginInput[],
  currency: CurrencyCode | string,
): MarginTotals {
  const complete = rows.filter((r) => r.hasRecipe && r.costComplete);
  const coveredRevenue = sumMinor(
    complete.map((r) => r.revenue),
    currency,
  );
  const margin = sumMinor(
    complete.map((r) => computeDishMargin(r, currency).margin ?? 0),
    currency,
  );
  const allRevenue = sumMinor(
    rows.map((r) => r.revenue),
    currency,
  );
  return {
    coveredRevenue,
    margin,
    coveragePct: allRevenue > 0 ? Math.round((coveredRevenue / allRevenue) * 100) : 0,
  };
}

export interface Delta {
  diff: number;
  /** null quand la periode precedente vaut 0: un pourcentage n'a pas de sens. */
  pct: number | null;
}

/** Ecart entre la periode en cours et la precedente, en valeur et en pourcentage. */
export function computeDelta(current: number, previous: number): Delta {
  return {
    diff: current - previous,
    pct: previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null,
  };
}
