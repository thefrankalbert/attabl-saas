'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryService } from '@/services/inventory.service';
import { ServiceError } from '@/services/errors';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import type {
  Ingredient,
  CreateIngredientInput,
  UpdateIngredientInput,
  RecipeLineInput,
  AdjustStockInput,
} from '@/types/inventory.types';

const ALLOWED_ROLES = ['owner', 'admin', 'manager'] as const;

const adjustStockSchema = z.object({
  tenantId: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  // Magnitude only; the service derives the sign from movement_type.
  quantity: z.number().finite().positive(),
  // 'order_destock' is system-only (written by destock_order via service_role).
  // A manual adjustment must never forge an order-attributed movement.
  movement_type: z.enum(['manual_add', 'manual_remove', 'adjustment', 'opening']),
  notes: z.string().optional(),
  supplier_id: z.string().uuid().optional(),
});

const ingredientUnitEnum = z.enum(['kg', 'L', 'pièce', 'cl', 'g', 'bouteille']);

const createIngredientSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  unit: ingredientUnitEnum,
  current_stock: z.number().finite().nonnegative().optional(),
  min_stock_alert: z.number().finite().nonnegative().optional(),
  cost_per_unit: z.number().finite().nonnegative().optional(),
  category: z.string().optional(),
});

const updateIngredientSchema = z.object({
  tenantId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  name: z.string().min(1).optional(),
  unit: ingredientUnitEnum.optional(),
  min_stock_alert: z.number().finite().nonnegative().optional(),
  cost_per_unit: z.number().finite().nonnegative().optional(),
  category: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const setRecipeSchema = z.object({
  tenantId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  lines: z.array(
    z.object({
      ingredient_id: z.string().uuid(),
      quantity_needed: z.number().positive(),
      notes: z.string().optional(),
    }),
  ),
});

const setOpeningStockSchema = z.object({
  tenantId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  quantity: z.number().finite().nonnegative(),
});

type ActionResult<T = undefined> =
  | { success: true; data?: T; error?: never }
  | { success?: never; error: string };

async function checkInventoryPermissions(
  tenantId: string,
): Promise<{ error: null; supabase: SupabaseClient } | { error: string; supabase: null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      tenantId,
      [...ALLOWED_ROLES],
      'inventory.edit',
    );
    return { error: null, supabase };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: 'Non authentifie', supabase: null };
      return { error: 'Permissions insuffisantes', supabase: null };
    }
    return { error: 'Permissions insuffisantes', supabase: null };
  }
}

/**
 * SECURITY: Adjusts stock for an ingredient.
 * Session membership for the given tenant is verified server-side.
 */
export async function actionAdjustStock(
  tenantId: string,
  input: AdjustStockInput,
): Promise<ActionResult> {
  const parsed = adjustStockSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.adjustStock(tenantId, input);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Creates a new ingredient for the tenant.
 * Session membership verified server-side.
 */
export async function actionCreateIngredient(
  tenantId: string,
  input: CreateIngredientInput,
): Promise<ActionResult<Ingredient>> {
  const parsed = createIngredientSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    const data = await service.createIngredient(tenantId, input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Updates an ingredient for the tenant.
 * Session membership verified server-side; service filters by both id and tenant_id.
 */
export async function actionUpdateIngredient(
  tenantId: string,
  ingredientId: string,
  input: UpdateIngredientInput,
): Promise<ActionResult<Ingredient>> {
  const parsed = updateIngredientSchema.safeParse({ tenantId, ingredientId, ...input });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    const data = await service.updateIngredient(ingredientId, tenantId, input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Saves (replaces) the recipe lines for a menu item.
 * Session membership verified server-side; service validates item belongs to tenant.
 */
export async function actionSetRecipe(
  tenantId: string,
  menuItemId: string,
  lines: RecipeLineInput[],
): Promise<ActionResult> {
  const parsed = setRecipeSchema.safeParse({ tenantId, menuItemId, lines });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.setRecipe(tenantId, menuItemId, lines);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Sets the opening stock for an ingredient.
 * Session membership verified server-side.
 */
export async function actionSetOpeningStock(
  tenantId: string,
  ingredientId: string,
  quantity: number,
): Promise<ActionResult> {
  const parsed = setOpeningStockSchema.safeParse({ tenantId, ingredientId, quantity });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.setOpeningStock(tenantId, ingredientId, quantity);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}
