// ─── Inventory Engine Types ─────────────────────────────

export type IngredientUnit = 'kg' | 'L' | 'pièce' | 'cl' | 'g' | 'bouteille';

// The DB CHECK also allows loss / transfer_in / transfer_out (added in the
// canonical-ledger migration). Those values are added to this union in the later
// phases that actually produce them (losses, transfers), keeping each phase's
// surface minimal. 'physical_count' is produced by the inventory-count phase.
export type MovementType =
  | 'order_destock'
  | 'order_restock'
  | 'manual_add'
  | 'manual_remove'
  | 'adjustment'
  | 'opening'
  | 'physical_count'
  | 'loss';

// Structured motif for losses / reconciliation (stock_movements.reason_code).
export type ReasonCode =
  | 'expired'
  | 'breakage'
  | 'theft'
  | 'spillage'
  | 'prep_waste'
  | 'recount'
  | 'reconcile'
  | 'other';

// Loss reasons are the subset of ReasonCode that a manual loss declaration can
// carry (recount / reconcile belong to physical_count / reconciliation, not a
// declared loss). Backed by the stock_movements_reason_code_check DB vocabulary.
export const LOSS_REASONS = [
  'breakage',
  'expired',
  'theft',
  'spillage',
  'prep_waste',
  'other',
] as const;

export type LossReasonCode = (typeof LOSS_REASONS)[number];

export type SuggestionType = 'pairing' | 'upsell' | 'alternative';

export interface Ingredient {
  id: string;
  tenant_id: string;
  name: string;
  unit: IngredientUnit;
  current_stock: number;
  min_stock_alert: number;
  cost_per_unit: number;
  category: string | null;
  is_active: boolean;
  // Optional purchasing-unit label (casier, sac, carton). NULL = bought in base unit.
  purchase_unit: string | null;
  // Base units (Ingredient.unit) contained in one purchase_unit. Default 1.
  units_per_purchase: number;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_needed: number;
  notes: string | null;
  created_at: string;
  // Joined fields
  ingredient?: Ingredient;
}

export interface StockMovement {
  id: string;
  tenant_id: string;
  ingredient_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_id: string | null;
  notes: string | null;
  reason_code?: ReasonCode | null;
  created_by: string | null;
  supplier_id: string | null;
  created_at: string;
  // Joined fields
  ingredient?: Pick<Ingredient, 'name' | 'unit'>;
  supplier?: { id: string; name: string } | null;
  // Resolved from admin_users by get_stock_movements_page (anti-vol trail).
  // NULL for system / unattributed movements (created_by not set or unresolvable).
  author_name?: string | null;
}

export interface StockStatus {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  cost_per_unit: number;
  category: string | null;
  is_active: boolean;
  nb_items_using: number;
  is_low: boolean;
}

// One drifting ingredient reported by verify_stock_ledger: the cache
// (current_stock) no longer equals SUM of signed ledger deltas.
export interface LedgerDriftRow {
  ingredient_id: string;
  name: string;
  current_stock: number;
  ledger_sum: number;
  drift: number;
}

// One row of the 'sorties par employe' anti-theft report
// (get_staff_stock_report): stock movements aggregated per operator.
export interface StaffStockReportRow {
  author_id: string | null;
  author_name: string | null;
  out_qty: number;
  in_qty: number;
  movements_count: number;
  manual_remove_qty: number;
  adjustment_out_qty: number;
  order_destock_qty: number;
}

// ─── Physical stock count (#12) ─────────────────────────

export type StockCountStatus = 'open' | 'committed' | 'cancelled';

export interface StockCount {
  id: string;
  tenant_id: string;
  reference: string | null;
  status: StockCountStatus;
  created_by: string | null;
  committed_by: string | null;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockCountLine {
  id: string;
  tenant_id: string;
  count_id: string;
  ingredient_id: string;
  theoretical_qty: number;
  counted_qty: number | null;
  variance: number | null;
  created_at: string;
  // Joined field
  ingredient?: Pick<Ingredient, 'name' | 'unit'>;
}

export interface OpenStockCountInput {
  reference?: string;
  ingredientIds?: string[];
}

export interface StockCountLineInput {
  ingredient_id: string;
  counted_qty: number | null;
}

// ─── Input types for service methods ────────────────────

export interface CreateIngredientInput {
  name: string;
  unit: IngredientUnit;
  current_stock?: number;
  min_stock_alert?: number;
  cost_per_unit?: number;
  category?: string;
  purchase_unit?: string | null;
  units_per_purchase?: number;
}

export interface UpdateIngredientInput {
  name?: string;
  unit?: IngredientUnit;
  min_stock_alert?: number;
  cost_per_unit?: number;
  category?: string | null;
  is_active?: boolean;
  purchase_unit?: string | null;
  units_per_purchase?: number;
}

// Receiving a stock delivery. When inPurchaseUnit is true, `quantity` is
// expressed in the ingredient's purchase_unit and converted to the base unit
// (via convertToBaseUnit) before the ledger write. supplier_id + notes carry
// the same supplier attribution / audit trail as a base-unit manual_add.
export interface ReceiveStockInput {
  ingredient_id: string;
  quantity: number;
  inPurchaseUnit: boolean;
  supplier_id?: string | null;
  notes?: string;
}

export interface RecipeLineInput {
  ingredient_id: string;
  quantity_needed: number;
  notes?: string;
}

export interface AdjustStockInput {
  ingredient_id: string;
  quantity: number;
  movement_type: MovementType;
  notes?: string;
  supplier_id?: string;
}

export interface RecordLossInput {
  ingredient_id: string;
  quantity: number;
  reason_code: LossReasonCode;
  notes?: string;
}

// One row of the losses-by-reason report (get_losses_by_reason).
// total_cost_value uses the legacy NUMERIC cost_per_unit (report only).
export interface LossByReason {
  reason_code: LossReasonCode;
  nb_movements: number;
  total_qty: number;
  total_cost_value: number;
}

// ─── Recipe (fiche technique) Excel import (#11) ────────

import type { ImportRowError } from '@/lib/excel-parse';

/** One validated recipe line parsed from an Excel sheet (dish grouped by name). */
export interface ParsedRecipeRow {
  rowNumber: number;
  dishName: string;
  ingredientName: string;
  unit: IngredientUnit;
  quantityNeeded: number;
  notes: string | null;
}

/**
 * A clean row sent to the import_recipes_tx RPC. The service pre-resolves the
 * dish name to a tenant-scoped menu_item_id and only forwards valid rows (the
 * RPC is all-or-nothing).
 */
export interface RecipeImportRpcRow {
  menu_item_id: string;
  ingredient_name: string;
  unit: IngredientUnit;
  quantity_needed: number;
  notes: string | null;
}

/** Result of a recipe Excel import (merge/upsert, get-or-create ingredients). */
export interface RecipeImportResult {
  recipesCreated: number;
  recipesUpdated: number;
  ingredientsCreated: number;
  itemsSkipped: number;
  errors: ImportRowError[];
}

// ─── Unit labels for UI ─────────────────────────────────

export const INGREDIENT_UNITS: Record<IngredientUnit, { label: string; labelShort: string }> = {
  kg: { label: 'Kilogramme', labelShort: 'kg' },
  g: { label: 'Gramme', labelShort: 'g' },
  L: { label: 'Litre', labelShort: 'L' },
  cl: { label: 'Centilitre', labelShort: 'cl' },
  pièce: { label: 'Pièce', labelShort: 'pcs' },
  bouteille: { label: 'Bouteille', labelShort: 'bout.' },
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, { label: string; color: string }> = {
  order_destock: { label: 'Commande', color: 'text-blue-600' },
  order_restock: { label: 'Retour commande', color: 'text-teal-600' },
  manual_add: { label: 'Ajout manuel', color: 'text-teal-600' },
  manual_remove: { label: 'Retrait manuel', color: 'text-red-600' },
  adjustment: { label: 'Ajustement', color: 'text-amber-600' },
  opening: { label: "Stock d'ouverture", color: 'text-purple-600' },
  physical_count: { label: 'Inventaire physique', color: 'text-purple-600' },
  loss: { label: 'Perte', color: 'text-red-600' },
};
