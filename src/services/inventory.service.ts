/**
 * Inventory Service - Stock management, recipes, and destock operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';
import { withActiveMenuItems } from '@/lib/menu-items-query';
import { convertToBaseUnit } from '@/lib/inventory/unit-conversion';
import type {
  Ingredient,
  IngredientUnit,
  Recipe,
  StockMovement,
  StockStatus,
  CreateIngredientInput,
  UpdateIngredientInput,
  ReceiveStockInput,
  RecipeLineInput,
  AdjustStockInput,
  RecordLossInput,
  LossByReason,
  LedgerDriftRow,
  MovementType,
  ReasonCode,
  StockCount,
  StockCountLine,
  StockCountLineInput,
  OpenStockCountInput,
} from '@/types/inventory.types';

// --- Pure row mapper -------------------------------------
// Shared between the service and the client hook so the flat RPC row
// is transformed in exactly one place.
export function mapStockMovementRow(row: Record<string, unknown>): StockMovement {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    ingredient_id: row.ingredient_id as string,
    movement_type: row.movement_type as MovementType,
    quantity: row.quantity as number,
    reference_id: (row.reference_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    reason_code: (row.reason_code as ReasonCode | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    supplier_id: (row.supplier_id as string | null) ?? null,
    created_at: row.created_at as string,
    author_name: (row.author_name as string | null) ?? null,
    ingredient:
      row.ingredient_name != null
        ? {
            name: row.ingredient_name as string,
            unit: row.ingredient_unit as IngredientUnit,
          }
        : undefined,
    supplier:
      row.supplier_id != null && row.supplier_name != null
        ? { id: row.supplier_id as string, name: row.supplier_name as string }
        : null,
  };
}

export interface InventoryService {
  getIngredients(tenantId: string): Promise<Ingredient[]>;
  createIngredient(tenantId: string, input: CreateIngredientInput): Promise<Ingredient>;
  updateIngredient(
    ingredientId: string,
    tenantId: string,
    input: UpdateIngredientInput,
  ): Promise<Ingredient>;
  getRecipesForItem(menuItemId: string, tenantId: string): Promise<Recipe[]>;
  setRecipe(tenantId: string, menuItemId: string, lines: RecipeLineInput[]): Promise<void>;
  destockOrder(orderId: string, tenantId: string, createdBy?: string): Promise<number>;
  restockOrder(orderId: string, tenantId: string, createdBy?: string): Promise<number>;
  adjustStock(tenantId: string, input: AdjustStockInput): Promise<void>;
  receiveStock(tenantId: string, input: ReceiveStockInput): Promise<void>;
  recordLoss(tenantId: string, input: RecordLossInput): Promise<void>;
  getLossesByReason(
    tenantId: string,
    filters?: { startDate?: string; endDate?: string },
  ): Promise<LossByReason[]>;
  setOpeningStock(tenantId: string, ingredientId: string, quantity: number): Promise<void>;
  verifyLedger(tenantId: string): Promise<LedgerDriftRow[]>;
  reconcileLedger(tenantId: string): Promise<number>;
  getStockStatus(tenantId: string): Promise<StockStatus[]>;
  getStockMovements(
    tenantId: string,
    filters?: { ingredientId?: string; startDate?: string; endDate?: string },
  ): Promise<StockMovement[]>;
  getRecipesOverview(tenantId: string): Promise<{
    menuItems: {
      id: string;
      name: string;
      category_id: string | null;
      is_available: boolean;
    }[];
    recipeItemIds: Set<string>;
  }>;
  // --- Physical Stock Count (#12) ----------------------
  openStockCount(tenantId: string, input: OpenStockCountInput): Promise<string>;
  listStockCounts(tenantId: string): Promise<StockCount[]>;
  getStockCount(
    tenantId: string,
    countId: string,
  ): Promise<{ count: StockCount; lines: StockCountLine[] }>;
  saveStockCountLines(
    tenantId: string,
    countId: string,
    lines: StockCountLineInput[],
  ): Promise<void>;
  commitStockCount(tenantId: string, countId: string): Promise<number>;
  cancelStockCount(tenantId: string, countId: string): Promise<void>;
}

export function createInventoryService(supabase: SupabaseClient): InventoryService {
  return {
    // --- Ingredients --------------------------------------

    async getIngredients(tenantId: string): Promise<Ingredient[]> {
      const { data, error } = await supabase
        .from('ingredients')
        .select(
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, purchase_unit, units_per_purchase, created_at, updated_at',
        )
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (error) throw new ServiceError('Erreur chargement ingrédients', 'INTERNAL', error);
      return (data as Ingredient[]) || [];
    },

    async createIngredient(tenantId: string, input: CreateIngredientInput): Promise<Ingredient> {
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          unit: input.unit,
          current_stock: input.current_stock ?? 0,
          min_stock_alert: input.min_stock_alert ?? 0,
          cost_per_unit: input.cost_per_unit ?? 0,
          category: input.category || null,
          purchase_unit: input.purchase_unit ?? null,
          units_per_purchase: input.units_per_purchase ?? 1,
        })
        .select(
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, purchase_unit, units_per_purchase, created_at, updated_at',
        )
        .single();

      if (error) throw new ServiceError('Erreur création ingrédient', 'INTERNAL', error);
      return data as Ingredient;
    },

    async updateIngredient(
      ingredientId: string,
      tenantId: string,
      input: UpdateIngredientInput,
    ): Promise<Ingredient> {
      const { data, error } = await supabase
        .from('ingredients')
        .update(input)
        .eq('id', ingredientId)
        .eq('tenant_id', tenantId)
        .select(
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, purchase_unit, units_per_purchase, created_at, updated_at',
        )
        .single();

      if (error) throw new ServiceError('Erreur mise à jour ingrédient', 'INTERNAL', error);
      return data as Ingredient;
    },

    // --- Recipes (Fiches techniques) ----------------------

    async getRecipesForItem(menuItemId: string, tenantId: string): Promise<Recipe[]> {
      // BUG-34: Validate menu_item_id belongs to this tenant before querying recipes
      const { data: menuItem } = await withActiveMenuItems(
        supabase.from('menu_items').select('id').eq('id', menuItemId).eq('tenant_id', tenantId),
      ).maybeSingle();

      if (!menuItem) {
        throw new ServiceError('Article non trouve dans ce restaurant', 'NOT_FOUND');
      }

      const { data, error } = await supabase
        .from('recipes')
        .select('*, ingredient:ingredients(id, name, unit, current_stock)')
        .eq('menu_item_id', menuItemId)
        .eq('tenant_id', tenantId);

      if (error) throw new ServiceError('Erreur chargement recette', 'INTERNAL', error);
      return (data as Recipe[]) || [];
    },

    async setRecipe(tenantId: string, menuItemId: string, lines: RecipeLineInput[]): Promise<void> {
      const { data: menuItem } = await withActiveMenuItems(
        supabase.from('menu_items').select('id').eq('id', menuItemId).eq('tenant_id', tenantId),
      ).maybeSingle();

      if (!menuItem) {
        throw new ServiceError('Article non trouve dans ce restaurant', 'NOT_FOUND');
      }

      const ingredientIds = lines.map((l) => l.ingredient_id);
      if (new Set(ingredientIds).size !== ingredientIds.length) {
        throw new ServiceError('Ingredient en double dans la fiche', 'VALIDATION');
      }

      for (const line of lines) {
        if (!line.ingredient_id) {
          throw new ServiceError('Ingredient manquant', 'VALIDATION');
        }
        if (!(Number(line.quantity_needed) > 0)) {
          throw new ServiceError('Quantite invalide pour un ingredient', 'VALIDATION');
        }
      }

      if (lines.length > 0) {
        const { data: ingredients, error: ingError } = await supabase
          .from('ingredients')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .in('id', ingredientIds);

        if (ingError) {
          throw new ServiceError('Erreur validation ingredients', 'INTERNAL', ingError);
        }
        if ((ingredients?.length ?? 0) !== ingredientIds.length) {
          throw new ServiceError('Un ou plusieurs ingredients sont invalides', 'VALIDATION');
        }
      }

      // Atomic replace (delete + insert in one transaction) via RPC so a failed
      // insert can never leave the recipe wiped.
      const { error: rpcError } = await supabase.rpc('set_recipe_tx', {
        p_tenant_id: tenantId,
        p_menu_item_id: menuItemId,
        p_lines: lines.map((line) => ({
          ingredient_id: line.ingredient_id,
          quantity_needed: line.quantity_needed,
          notes: line.notes || null,
        })),
      });

      if (rpcError) throw new ServiceError('Erreur sauvegarde recette', 'INTERNAL', rpcError);
    },

    // --- Stock Operations ---------------------------------

    async destockOrder(orderId: string, tenantId: string, createdBy?: string): Promise<number> {
      const { data, error } = await supabase.rpc('destock_order', {
        p_order_id: orderId,
        p_tenant_id: tenantId,
        // Acting user for traceability (anti-vol). NULL for the anon storefront
        // path (no operator); the POS/admin paths pass the authenticated user.
        p_created_by: createdBy || undefined,
      });

      if (error) {
        if (error.message?.includes('INSUFFICIENT_STOCK')) {
          throw new ServiceError('Stock insuffisant pour cette commande', 'CONFLICT', error);
        }
        throw new ServiceError('Erreur déstockage commande', 'INTERNAL', error);
      }
      const count = (data as number) ?? 0;
      if (count === 0) {
        logger.warn('destockOrder returned 0 items updated', { orderId, tenantId });
      }
      return count;
    },

    async restockOrder(orderId: string, tenantId: string, createdBy?: string): Promise<number> {
      // Reverses a prior destock when an order is cancelled/refunded. Idempotent:
      // the RPC skips ingredients already restocked for this order.
      const { data, error } = await supabase.rpc('restock_order', {
        p_order_id: orderId,
        p_tenant_id: tenantId,
        p_created_by: createdBy || undefined,
      });

      if (error) throw new ServiceError('Erreur restockage commande', 'INTERNAL', error);
      return (data as number) ?? 0;
    },

    async adjustStock(tenantId: string, input: AdjustStockInput): Promise<void> {
      // Determine stock change direction (callers pass a positive magnitude).
      const delta =
        input.movement_type === 'manual_add' || input.movement_type === 'opening'
          ? Math.abs(input.quantity)
          : -Math.abs(input.quantity);

      // Get current user for the audit trail.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Atomic RPC: clamps stock at >=0, records the ACTUAL applied delta as a
      // movement, and validates the supplier belongs to the tenant - all in one
      // transaction so the ledger always reconstructs current_stock.
      const { error } = await supabase.rpc('adjust_ingredient_stock_tx', {
        p_tenant_id: tenantId,
        p_ingredient_id: input.ingredient_id,
        p_delta: delta,
        p_movement_type: input.movement_type,
        p_notes: input.notes || undefined,
        p_created_by: user?.id || undefined,
        p_supplier_id: input.supplier_id || undefined,
      });

      if (error) {
        if (error.message?.includes('INVALID_SUPPLIER')) {
          throw new ServiceError('Fournisseur invalide', 'VALIDATION', error);
        }
        if (error.message?.includes('INGREDIENT_NOT_FOUND')) {
          throw new ServiceError('Ingredient introuvable', 'NOT_FOUND', error);
        }
        throw new ServiceError('Erreur ajustement stock', 'INTERNAL', error);
      }
    },

    async receiveStock(tenantId: string, input: ReceiveStockInput): Promise<void> {
      // Load the ingredient (tenant-scoped) to read its base unit + purchase
      // conversion config. The ledger stays in base unit, so any purchase-unit
      // quantity is converted here BEFORE the manual_add path.
      const { data: ingredient, error: fetchError } = await supabase
        .from('ingredients')
        .select('id, unit, purchase_unit, units_per_purchase')
        .eq('id', input.ingredient_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (fetchError)
        throw new ServiceError('Erreur chargement ingredient', 'INTERNAL', fetchError);
      if (!ingredient) throw new ServiceError('Ingredient introuvable', 'NOT_FOUND');

      const ing = ingredient as Pick<
        Ingredient,
        'id' | 'unit' | 'purchase_unit' | 'units_per_purchase'
      >;

      let baseQty: number;
      let autoNote: string;
      if (input.inPurchaseUnit) {
        try {
          baseQty = convertToBaseUnit({
            quantity: input.quantity,
            baseUnit: ing.unit,
            purchaseUnit: ing.purchase_unit,
            unitsPerPurchase: Number(ing.units_per_purchase),
          });
        } catch {
          throw new ServiceError('Facteur de conversion invalide', 'VALIDATION');
        }
        // ASCII-only ledger note describing the receipt, e.g. "Recu: 2 casier (48 bouteille)".
        autoNote = `Recu: ${input.quantity} ${ing.purchase_unit ?? ing.unit} (${baseQty} ${ing.unit})`;
      } else {
        baseQty = convertToBaseUnit({
          quantity: input.quantity,
          baseUnit: ing.unit,
          purchaseUnit: null,
          unitsPerPurchase: Number(ing.units_per_purchase),
        });
        autoNote = `Recu: ${baseQty} ${ing.unit}`;
      }

      // Keep the auto breakdown for the ledger trail; append the operator's
      // typed note when present (ASCII hyphen separator).
      const userNote = input.notes?.trim();
      const note = userNote ? `${autoNote} - ${userNote}` : autoNote;

      // Get the acting user for the audit trail (anti-vol traceability).
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Reuse the canonical manual-add ledger path: same atomic RPC as
      // adjustStock (clamps at >=0, records the applied delta, reconcilable).
      // supplier_id is forwarded for supplier attribution (validated by the RPC).
      const { error } = await supabase.rpc('adjust_ingredient_stock_tx', {
        p_tenant_id: tenantId,
        p_ingredient_id: input.ingredient_id,
        p_delta: baseQty,
        p_movement_type: 'manual_add',
        p_notes: note,
        p_created_by: user?.id || undefined,
        p_supplier_id: input.supplier_id || undefined,
      });

      if (error) {
        if (error.message?.includes('INVALID_SUPPLIER')) {
          throw new ServiceError('Fournisseur invalide', 'VALIDATION', error);
        }
        if (error.message?.includes('INGREDIENT_NOT_FOUND')) {
          throw new ServiceError('Ingredient introuvable', 'NOT_FOUND', error);
        }
        throw new ServiceError('Erreur reception stock', 'INTERNAL', error);
      }
    },

    async recordLoss(tenantId: string, input: RecordLossInput): Promise<void> {
      // Stamp the acting user on the ledger movement (anti-vol traceability).
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Atomic RPC: clamps stock at >=0, records the ACTUAL applied delta as a
      // reconcilable 'loss' movement carrying reason_code, and auto-disables
      // dependent menu items when the ingredient hits 0 - all in one transaction.
      const { error } = await supabase.rpc('record_loss_tx', {
        p_tenant_id: tenantId,
        p_ingredient_id: input.ingredient_id,
        p_quantity: Math.abs(input.quantity),
        p_reason_code: input.reason_code,
        p_notes: input.notes || undefined,
        p_created_by: user?.id || undefined,
      });

      if (error) {
        if (error.message?.includes('INGREDIENT_NOT_FOUND')) {
          throw new ServiceError('Ingredient introuvable', 'NOT_FOUND', error);
        }
        if (
          error.message?.includes('INVALID_REASON') ||
          error.message?.includes('INVALID_QUANTITY')
        ) {
          throw new ServiceError('Perte invalide', 'VALIDATION', error);
        }
        throw new ServiceError('Erreur enregistrement perte', 'INTERNAL', error);
      }
    },

    async getLossesByReason(
      tenantId: string,
      filters?: { startDate?: string; endDate?: string },
    ): Promise<LossByReason[]> {
      const { data, error } = await supabase.rpc('get_losses_by_reason', {
        p_tenant_id: tenantId,
        p_start: filters?.startDate ?? undefined,
        p_end: filters?.endDate ?? undefined,
      });

      if (error) throw new ServiceError('Erreur rapport pertes', 'INTERNAL', error);
      return (data as LossByReason[]) || [];
    },

    async setOpeningStock(tenantId: string, ingredientId: string, quantity: number): Promise<void> {
      // Stamp the acting user on the ledger movement (anti-vol traceability).
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.rpc('set_opening_stock', {
        p_tenant_id: tenantId,
        p_ingredient_id: ingredientId,
        p_quantity: quantity,
        p_created_by: user?.id || undefined,
      });

      if (error) {
        if (error.message?.includes('INGREDIENT_NOT_FOUND')) {
          throw new ServiceError('Ingredient introuvable', 'NOT_FOUND', error);
        }
        throw new ServiceError("Erreur stock d'ouverture", 'INTERNAL', error);
      }
    },

    async verifyLedger(tenantId: string): Promise<LedgerDriftRow[]> {
      const { data, error } = await supabase.rpc('verify_stock_ledger', {
        p_tenant_id: tenantId,
      });

      if (error) throw new ServiceError('Erreur verification ledger', 'INTERNAL', error);
      return (data as LedgerDriftRow[]) || [];
    },

    async reconcileLedger(tenantId: string): Promise<number> {
      // Resolve the acting user in-service and stamp it on the reconciliation
      // movements (anti-vol traceability), mirroring setOpeningStock.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc('reconcile_stock_ledger', {
        p_tenant_id: tenantId,
        p_created_by: user?.id || undefined,
      });

      if (error) throw new ServiceError('Erreur reconciliation ledger', 'INTERNAL', error);
      return (data as number) ?? 0;
    },

    // --- Stock Status & Movements -------------------------

    async getStockStatus(tenantId: string): Promise<StockStatus[]> {
      const { data, error } = await supabase.rpc('get_stock_status', {
        p_tenant_id: tenantId,
      });

      if (error) throw new ServiceError('Erreur statut stock', 'INTERNAL', error);
      return (data as StockStatus[]) || [];
    },

    async getStockMovements(
      tenantId: string,
      filters?: { ingredientId?: string; startDate?: string; endDate?: string },
    ): Promise<StockMovement[]> {
      let query = supabase
        .from('stock_movements')
        .select('*, ingredient:ingredients(name, unit), supplier:suppliers(id, name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.ingredientId) {
        query = query.eq('ingredient_id', filters.ingredientId);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw new ServiceError('Erreur historique mouvements', 'INTERNAL', error);
      return (data as StockMovement[]) || [];
    },

    /**
     * Load the menu items and the set of items that already have a recipe
     * configured. Used by the RecipesClient dashboard.
     */
    async getRecipesOverview(tenantId: string): Promise<{
      menuItems: {
        id: string;
        name: string;
        category_id: string | null;
        is_available: boolean;
      }[];
      recipeItemIds: Set<string>;
    }> {
      const [itemsRes, recipesRes] = await Promise.all([
        withActiveMenuItems(
          supabase
            .from('menu_items')
            .select('id, name, category_id, is_available')
            .eq('tenant_id', tenantId),
        ).order('name'),
        supabase.from('recipes').select('menu_item_id').eq('tenant_id', tenantId),
      ]);

      if (itemsRes.error) {
        throw new ServiceError('Erreur chargement articles', 'INTERNAL', itemsRes.error);
      }
      if (recipesRes.error) {
        throw new ServiceError('Erreur chargement recettes', 'INTERNAL', recipesRes.error);
      }

      const menuItems =
        (itemsRes.data as {
          id: string;
          name: string;
          category_id: string | null;
          is_available: boolean;
        }[]) || [];
      const recipeItemIds = new Set(
        (recipesRes.data || []).map((r: { menu_item_id: string }) => r.menu_item_id),
      );
      return { menuItems, recipeItemIds };
    },

    // --- Physical Stock Count (#12) ----------------------

    async openStockCount(tenantId: string, input: OpenStockCountInput): Promise<string> {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc('open_stock_count', {
        p_tenant_id: tenantId,
        p_reference: input.reference ?? null,
        p_created_by: user?.id ?? null,
        p_ingredient_ids: input.ingredientIds ?? null,
      });

      if (error) {
        // The app-level open-check is racy; the partial unique index
        // (uniq_stock_counts_one_open) is the real guard and raises 23505 on a
        // concurrent open. Map both to the same CONFLICT so the UI stays coherent.
        if (error.message?.includes('OPEN_COUNT_EXISTS') || error.code === '23505') {
          throw new ServiceError('Un inventaire est deja ouvert', 'CONFLICT', error);
        }
        if (error.message?.includes('NO_INGREDIENTS')) {
          throw new ServiceError('Aucun ingredient disponible', 'VALIDATION', error);
        }
        throw new ServiceError('Erreur creation inventaire', 'INTERNAL', error);
      }
      return data as string;
    },

    async listStockCounts(tenantId: string): Promise<StockCount[]> {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new ServiceError('Erreur chargement inventaires', 'INTERNAL', error);
      return (data as StockCount[]) || [];
    },

    async getStockCount(
      tenantId: string,
      countId: string,
    ): Promise<{ count: StockCount; lines: StockCountLine[] }> {
      const { data: countData, error: countError } = await supabase
        .from('stock_counts')
        .select('*')
        .eq('id', countId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (countError)
        throw new ServiceError('Erreur chargement inventaire', 'INTERNAL', countError);
      if (!countData) throw new ServiceError('Inventaire introuvable', 'NOT_FOUND');

      const { data: linesData, error: linesError } = await supabase
        .from('stock_count_lines')
        .select('*, ingredient:ingredients(name, unit)')
        .eq('count_id', countId)
        .eq('tenant_id', tenantId);

      if (linesError)
        throw new ServiceError('Erreur chargement lignes inventaire', 'INTERNAL', linesError);

      const lines = ((linesData as StockCountLine[]) || []).sort((a, b) =>
        (a.ingredient?.name ?? '').localeCompare(b.ingredient?.name ?? ''),
      );

      return { count: countData as StockCount, lines };
    },

    async saveStockCountLines(
      tenantId: string,
      countId: string,
      lines: StockCountLineInput[],
    ): Promise<void> {
      const { error } = await supabase.rpc('save_stock_count_lines', {
        p_tenant_id: tenantId,
        p_count_id: countId,
        p_lines: lines,
      });

      if (error) {
        if (error.message?.includes('COUNT_NOT_FOUND')) {
          throw new ServiceError('Inventaire introuvable', 'NOT_FOUND', error);
        }
        if (error.message?.includes('COUNT_NOT_OPEN')) {
          throw new ServiceError('Inventaire non ouvert', 'CONFLICT', error);
        }
        if (error.message?.includes('INVALID_COUNTED_QTY')) {
          throw new ServiceError('Quantite comptee invalide', 'VALIDATION', error);
        }
        throw new ServiceError('Erreur sauvegarde lignes inventaire', 'INTERNAL', error);
      }
    },

    async commitStockCount(tenantId: string, countId: string): Promise<number> {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc('commit_stock_count', {
        p_tenant_id: tenantId,
        p_count_id: countId,
        p_committed_by: user?.id ?? null,
      });

      if (error) {
        if (error.message?.includes('COUNT_NOT_FOUND')) {
          throw new ServiceError('Inventaire introuvable', 'NOT_FOUND', error);
        }
        if (error.message?.includes('COUNT_ALREADY_CLOSED')) {
          throw new ServiceError('Inventaire deja clos', 'CONFLICT', error);
        }
        throw new ServiceError('Erreur validation inventaire', 'INTERNAL', error);
      }
      return (data as number) ?? 0;
    },

    async cancelStockCount(tenantId: string, countId: string): Promise<void> {
      const { error } = await supabase.rpc('cancel_stock_count', {
        p_tenant_id: tenantId,
        p_count_id: countId,
      });

      if (error) {
        if (error.message?.includes('COUNT_NOT_FOUND')) {
          throw new ServiceError('Inventaire introuvable', 'NOT_FOUND', error);
        }
        if (error.message?.includes('COUNT_NOT_OPEN')) {
          throw new ServiceError('Inventaire non ouvert', 'CONFLICT', error);
        }
        throw new ServiceError('Erreur annulation inventaire', 'INTERNAL', error);
      }
    },
  };
}
