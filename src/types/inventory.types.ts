// ─── Inventory Engine Types ─────────────────────────────

export type IngredientUnit = 'kg' | 'L' | 'pièce' | 'cl' | 'g' | 'bouteille';

export type MovementType =
  | 'order_destock'
  | 'manual_add'
  | 'manual_remove'
  | 'adjustment'
  | 'opening';

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
  created_by: string | null;
  supplier_id: string | null;
  created_at: string;
  // Joined fields
  ingredient?: Pick<Ingredient, 'name' | 'unit'>;
  supplier?: { id: string; name: string } | null;
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

export interface ItemSuggestion {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

// ─── Input types for service methods ────────────────────

export interface CreateIngredientInput {
  name: string;
  unit: IngredientUnit;
  current_stock?: number;
  min_stock_alert?: number;
  cost_per_unit?: number;
  category?: string;
}

export interface UpdateIngredientInput {
  name?: string;
  unit?: IngredientUnit;
  min_stock_alert?: number;
  cost_per_unit?: number;
  category?: string | null;
  is_active?: boolean;
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
  manual_add: { label: 'Ajout manuel', color: 'text-green-600' },
  manual_remove: { label: 'Retrait manuel', color: 'text-red-600' },
  adjustment: { label: 'Ajustement', color: 'text-amber-600' },
  opening: { label: "Stock d'ouverture", color: 'text-purple-600' },
};
