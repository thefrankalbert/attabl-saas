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
  ReceiveStockInput,
  RecipeLineInput,
  AdjustStockInput,
  RecordLossInput,
  LossByReason,
} from '@/types/inventory.types';
import { LOSS_REASONS } from '@/types/inventory.types';

const ALLOWED_ROLES = ['owner', 'admin', 'manager'] as const;

// READ surfaces (reports) are gated purely on the permission, not a coarse role
// list - mirroring the page's requireAdminPermission('inventory.view'). Passing
// every role makes the role gate a no-op so any role holding inventory.view
// (default: owner/admin/manager/chef; or cashier/waiter via a tenant/user
// override) can load AND filter the report, matching the page + nav + RoleGuard.
const VIEW_ROLES = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

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

const recordLossSchema = z.object({
  tenantId: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  quantity: z.number().finite().positive(),
  reason_code: z.enum(LOSS_REASONS),
  notes: z.string().optional(),
});

const lossesFilterSchema = z.object({
  tenantId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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
  purchase_unit: z.string().max(40).nullable().optional(),
  units_per_purchase: z.number().finite().positive().optional(),
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
  purchase_unit: z.string().max(40).nullable().optional(),
  units_per_purchase: z.number().finite().positive().optional(),
});

const receiveStockSchema = z.object({
  tenantId: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  quantity: z.number().finite().positive(),
  inPurchaseUnit: z.boolean(),
  supplier_id: z.string().uuid().nullable().optional(),
  // Capped so the operator note appended to the auto receipt breakdown stays bounded.
  notes: z.string().max(500).optional(),
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
 * READ-level guard for inventory report surfaces. Gates on 'inventory.view'
 * (not the 'inventory.edit' write helper) so a view-only member (e.g. a chef,
 * or a custom role granted the view override) can load AND refetch the report,
 * mirroring the page's requireAdminPermission('inventory.view').
 */
async function checkInventoryViewPermissions(
  tenantId: string,
): Promise<{ error: null; supabase: SupabaseClient } | { error: string; supabase: null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      tenantId,
      [...VIEW_ROLES],
      'inventory.view',
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
    // Forward the VALIDATED fields (not the raw input) so unknown keys cannot
    // reach the persistence layer (defense against mass-assignment).
    await service.adjustStock(tenantId, {
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      movement_type: parsed.data.movement_type,
      notes: parsed.data.notes,
      supplier_id: parsed.data.supplier_id,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Receives a stock delivery for an ingredient, optionally expressed
 * in the ingredient's purchase unit (converted to base unit server-side before
 * the ledger write). Receiving stock is a WRITE - gated at inventory.edit.
 * Session membership for the given tenant is verified server-side.
 */
export async function actionReceiveStock(
  tenantId: string,
  input: ReceiveStockInput,
): Promise<ActionResult> {
  const parsed = receiveStockSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    // Forward the VALIDATED payload (not the raw input) to the service.
    await service.receiveStock(tenantId, {
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      inPurchaseUnit: parsed.data.inPurchaseUnit,
      supplier_id: parsed.data.supplier_id,
      notes: parsed.data.notes,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Records a structured stock loss for an ingredient.
 * Session membership for the given tenant is verified server-side.
 */
export async function actionRecordLoss(
  tenantId: string,
  input: RecordLossInput,
): Promise<ActionResult> {
  const parsed = recordLossSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.recordLoss(tenantId, {
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      reason_code: parsed.data.reason_code,
      notes: parsed.data.notes,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Returns the losses-by-reason report for the tenant.
 * Session membership verified server-side.
 */
export async function actionGetLossesByReason(
  tenantId: string,
  filters?: { startDate?: string; endDate?: string },
): Promise<ActionResult<LossByReason[]>> {
  const parsed = lossesFilterSchema.safeParse({ tenantId, ...filters });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkInventoryViewPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    const data = await service.getLossesByReason(tenantId, filters);
    return { success: true, data };
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
    const data = await service.createIngredient(tenantId, {
      name: parsed.data.name,
      unit: parsed.data.unit,
      current_stock: parsed.data.current_stock,
      min_stock_alert: parsed.data.min_stock_alert,
      cost_per_unit: parsed.data.cost_per_unit,
      category: parsed.data.category,
      purchase_unit: parsed.data.purchase_unit,
      units_per_purchase: parsed.data.units_per_purchase,
    });
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
    // Forward validated data; the service applies an explicit column allowlist
    // (current_stock can only move through the ledger RPCs, never a direct update).
    const data = await service.updateIngredient(ingredientId, tenantId, parsed.data);
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
