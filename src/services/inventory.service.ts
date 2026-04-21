/**
 * Inventory Service - Stock management, recipes, and destock operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';
import type {
  Ingredient,
  Recipe,
  StockMovement,
  StockStatus,
  CreateIngredientInput,
  UpdateIngredientInput,
  RecipeLineInput,
  AdjustStockInput,
} from '@/types/inventory.types';

export function createInventoryService(supabase: SupabaseClient) {
  return {
    // ─── Ingredients ──────────────────────────────────────

    async getIngredients(tenantId: string): Promise<Ingredient[]> {
      const { data, error } = await supabase
        .from('ingredients')
        .select(
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, created_at, updated_at',
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
        })
        .select(
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, created_at, updated_at',
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
          'id, tenant_id, name, unit, current_stock, min_stock_alert, cost_per_unit, category, is_active, created_at, updated_at',
        )
        .single();

      if (error) throw new ServiceError('Erreur mise à jour ingrédient', 'INTERNAL', error);
      return data as Ingredient;
    },

    // ─── Recipes (Fiches techniques) ──────────────────────

    async getRecipesForItem(menuItemId: string, tenantId: string): Promise<Recipe[]> {
      // BUG-34: Validate menu_item_id belongs to this tenant before querying recipes
      const { data: menuItem } = await supabase
        .from('menu_items')
        .select('id')
        .eq('id', menuItemId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

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
      // Delete existing recipe lines for this item
      const { error: deleteError } = await supabase
        .from('recipes')
        .delete()
        .eq('menu_item_id', menuItemId)
        .eq('tenant_id', tenantId);

      if (deleteError)
        throw new ServiceError('Erreur suppression recette', 'INTERNAL', deleteError);

      if (lines.length === 0) return;

      // Insert new lines
      const rows = lines.map((line) => ({
        tenant_id: tenantId,
        menu_item_id: menuItemId,
        ingredient_id: line.ingredient_id,
        quantity_needed: line.quantity_needed,
        notes: line.notes || null,
      }));

      const { error: insertError } = await supabase.from('recipes').insert(rows);

      if (insertError) throw new ServiceError('Erreur sauvegarde recette', 'INTERNAL', insertError);
    },

    // ─── Stock Operations ─────────────────────────────────

    async destockOrder(orderId: string, tenantId: string): Promise<number> {
      const { data, error } = await supabase.rpc('destock_order', {
        p_order_id: orderId,
        p_tenant_id: tenantId,
      });

      if (error) throw new ServiceError('Erreur déstockage commande', 'INTERNAL', error);
      const count = (data as number) ?? 0;
      if (count === 0) {
        logger.warn('destockOrder returned 0 items updated', { orderId, tenantId });
      }
      return count;
    },

    async adjustStock(tenantId: string, input: AdjustStockInput): Promise<void> {
      // Determine stock change direction
      const delta =
        input.movement_type === 'manual_add' || input.movement_type === 'opening'
          ? Math.abs(input.quantity)
          : -Math.abs(input.quantity);

      // Update ingredient stock (atomic via RPC)
      const { error: updateError } = await supabase.rpc('adjust_ingredient_stock', {
        p_tenant_id: tenantId,
        p_ingredient_id: input.ingredient_id,
        p_delta: delta,
      });

      if (updateError) throw new ServiceError('Erreur ajustement stock', 'INTERNAL', updateError);

      // Get current user for audit trail
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Record movement
      const { error: movementError } = await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        ingredient_id: input.ingredient_id,
        movement_type: input.movement_type,
        quantity: delta,
        notes: input.notes || null,
        created_by: user?.id || null,
        supplier_id: input.supplier_id || null,
      });

      if (movementError)
        throw new ServiceError('Erreur enregistrement mouvement', 'INTERNAL', movementError);
    },

    async setOpeningStock(tenantId: string, ingredientId: string, quantity: number): Promise<void> {
      const { error } = await supabase.rpc('set_opening_stock', {
        p_tenant_id: tenantId,
        p_ingredient_id: ingredientId,
        p_quantity: quantity,
      });

      if (error) throw new ServiceError("Erreur stock d'ouverture", 'INTERNAL', error);
    },

    // ─── Stock Status & Movements ─────────────────────────

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
        supabase
          .from('menu_items')
          .select('id, name, category_id, is_available')
          .eq('tenant_id', tenantId)
          .order('name'),
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
  };
}
