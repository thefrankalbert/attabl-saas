'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryService } from '@/services/inventory.service';
import { ServiceError } from '@/services/errors';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { isFeatureEntitled, type GatedFeature } from '@/lib/plans/assert-feature';
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
import { MAX_STOCK_QUANTITY, MAX_UNIT_COST } from '@/lib/inventory/quantity-format';

// Le module Inventaire est une fonctionnalite Pro. La page la gate deja
// (inventory/page.tsx, canAccessInventory), mais une Server Action est un
// endpoint POST adressable par son Action ID: sans cette garde, un tenant
// Starter appelait les mutations directement, sans jamais voir l'ecran.
const INVENTORY_PLAN_ERROR = 'Le module Inventaire est reserve au plan Pro.';
const RECIPES_PLAN_ERROR = 'Les fiches techniques sont reservees au plan Pro.';

// Reads AND writes are gated purely on the right (inventory.view /
// inventory.edit), never on a list of postes: an owner setting (e.g.
// inventory.edit removed from the chef in /settings/permissions) is honored
// here exactly as by the import routes.

// Messages en francais clair: ils s'affichent tels quels a l'ecran, et disent quel
// champ corriger. Sans eux, zod renvoyait ses messages anglais par defaut (ou un
// "Invalid input" generique) pour un nom trop long ou une quantite nulle.
const UUID_MESSAGE = 'Élément introuvable. Rechargez la page et réessayez.';
const uuidField = z.string({ error: UUID_MESSAGE }).uuid(UUID_MESSAGE);

const positiveQuantityField = z
  .number({ error: 'Saisissez une quantité valide.' })
  .finite('Saisissez une quantité valide.')
  .positive('La quantité doit être supérieure à 0.')
  .max(MAX_STOCK_QUANTITY, 'La quantité est trop grande (9 999 999 au maximum).');

// Prix d'achat d'une livraison, dans l'unite de la quantite saisie. Il
// recalcule le cout moyen pondere du produit (adjust_ingredient_stock_tx).
const unitCostField = z
  .number({ error: "Saisissez un prix d'achat valide." })
  .finite("Saisissez un prix d'achat valide.")
  .positive("Le prix d'achat doit être supérieur à 0.")
  .max(MAX_UNIT_COST, "Le prix d'achat est trop grand (99 999 999 au maximum).");

const adjustStockSchema = z
  .object({
    tenantId: uuidField,
    ingredient_id: uuidField,
    // Magnitude only; the service derives the sign from movement_type.
    quantity: positiveQuantityField,
    // 'order_destock' is system-only (written by destock_order via service_role).
    // A manual adjustment must never forge an order-attributed movement.
    movement_type: z.enum(['manual_add', 'manual_remove', 'adjustment', 'opening'], {
      error: 'Type de mouvement invalide.',
    }),
    notes: z.string().optional(),
    supplier_id: uuidField.optional(),
    unit_cost: unitCostField.optional(),
  })
  .refine((v) => v.unit_cost === undefined || v.movement_type === 'manual_add', {
    message: "Un prix d'achat se saisit seulement pour une réception.",
    path: ['unit_cost'],
  });

const recordLossSchema = z.object({
  tenantId: uuidField,
  ingredient_id: uuidField,
  quantity: positiveQuantityField,
  reason_code: z.enum(LOSS_REASONS, { error: 'Motif de perte invalide.' }),
  notes: z.string().optional(),
});

const lossesFilterSchema = z.object({
  tenantId: uuidField,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const ingredientUnitEnum = z.enum(['kg', 'L', 'pièce', 'cl', 'g', 'bouteille'], {
  error: 'Unité invalide.',
});

const ingredientNameField = z
  .string({ error: 'Le nom est requis' })
  .trim()
  .min(1, 'Le nom est requis')
  .max(100, 'Le nom est trop long (100 caractères au maximum).');

const nonNegativeField = (label: string) =>
  z
    .number({ error: `${label} : saisissez un nombre valide.` })
    .finite(`${label} : saisissez un nombre valide.`)
    .nonnegative(`${label} ne peut pas être négatif.`)
    .max(MAX_STOCK_QUANTITY, `${label} est trop grand (9 999 999 au maximum).`);

const unitsPerPurchaseField = z
  .number({ error: "Le nombre d'unités par achat doit être supérieur à 0." })
  .finite("Le nombre d'unités par achat doit être supérieur à 0.")
  .positive("Le nombre d'unités par achat doit être supérieur à 0.");

const createIngredientSchema = z.object({
  tenantId: uuidField,
  name: ingredientNameField,
  unit: ingredientUnitEnum,
  current_stock: nonNegativeField('Le stock').optional(),
  min_stock_alert: nonNegativeField("Le seuil d'alerte").optional(),
  cost_per_unit: nonNegativeField('Le coût').optional(),
  category: z.string().optional(),
  purchase_unit: z
    .string()
    .max(40, "L'unité d'achat est trop longue (40 caractères au maximum).")
    .nullable()
    .optional(),
  units_per_purchase: unitsPerPurchaseField.optional(),
});

const updateIngredientSchema = z.object({
  tenantId: uuidField,
  ingredientId: uuidField,
  name: ingredientNameField.optional(),
  unit: ingredientUnitEnum.optional(),
  min_stock_alert: nonNegativeField("Le seuil d'alerte").optional(),
  cost_per_unit: nonNegativeField('Le coût').optional(),
  category: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  purchase_unit: z
    .string()
    .max(40, "L'unité d'achat est trop longue (40 caractères au maximum).")
    .nullable()
    .optional(),
  units_per_purchase: unitsPerPurchaseField.optional(),
});

const receiveStockSchema = z.object({
  tenantId: uuidField,
  ingredient_id: uuidField,
  quantity: positiveQuantityField,
  inPurchaseUnit: z.boolean({ error: "Choix d'unité invalide." }),
  supplier_id: uuidField.nullable().optional(),
  // Capped so the operator note appended to the auto receipt breakdown stays bounded.
  notes: z.string().max(500, 'La note est trop longue (500 caractères au maximum).').optional(),
  unit_cost: unitCostField.optional(),
});

const setRecipeSchema = z.object({
  tenantId: uuidField,
  menuItemId: uuidField,
  lines: z.array(
    z.object({
      ingredient_id: uuidField,
      quantity_needed: z
        .number({ error: 'Saisissez une quantité valide.' })
        .positive('La quantité doit être supérieure à 0.'),
      notes: z.string().optional(),
    }),
  ),
});

const setOpeningStockSchema = z.object({
  tenantId: uuidField,
  ingredientId: uuidField,
  quantity: nonNegativeField('Le stock'),
});

/** Premier message de validation, deja en francais (voir les schemas ci-dessus). */
function invalidInputMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Données invalides. Vérifiez les champs saisis.';
}

type ActionResult<T = undefined> =
  { success: true; data?: T; error?: never } | { success?: never; error: string };

async function checkInventoryPermissions(
  tenantId: string,
  feature: GatedFeature = 'canAccessInventory',
  planError: string = INVENTORY_PLAN_ERROR,
): Promise<{ error: null; supabase: SupabaseClient } | { error: string; supabase: null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(tenantId, 'inventory.edit');
    // Coupure du restaurant: ce garde ne sert que des ecritures (la lecture du
    // rapport des pertes passe par checkInventoryViewPermissions, sans coupure).
    await assertTenantServing(tenantId);
    if (!(await isFeatureEntitled(supabase, tenantId, feature))) {
      return { error: planError, supabase: null };
    }
    return { error: null, supabase };
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) return { error: err.message, supabase: null };
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
    const { supabase } = await getAuthenticatedUserForTenant(tenantId, 'inventory.view');
    if (!(await isFeatureEntitled(supabase, tenantId, 'canAccessInventory'))) {
      return { error: INVENTORY_PLAN_ERROR, supabase: null };
    }
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
    return { error: invalidInputMessage(parsed.error) };
  }

  const { error: permError, supabase } = await checkInventoryPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    // "Stock d'ouverture" REMPLACE le stock par la quantite saisie (10 puis
    // ouverture 5 donne 5): il passe par la fonction d'ouverture, qui ecrit le
    // mouvement `opening` pour l'ecart. En ajout (10 puis 5 donnait 15), le stock
    // d'ouverture s'additionnait en silence au stock existant.
    if (parsed.data.movement_type === 'opening') {
      await service.setOpeningStock(tenantId, parsed.data.ingredient_id, parsed.data.quantity);
      return { success: true };
    }
    // Forward the VALIDATED fields (not the raw input) so unknown keys cannot
    // reach the persistence layer (defense against mass-assignment).
    await service.adjustStock(tenantId, {
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      movement_type: parsed.data.movement_type,
      notes: parsed.data.notes,
      supplier_id: parsed.data.supplier_id,
      unit_cost: parsed.data.unit_cost,
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
    return { error: invalidInputMessage(parsed.error) };
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
      unit_cost: parsed.data.unit_cost,
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
    return { error: invalidInputMessage(parsed.error) };
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
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };

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
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };

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
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };

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
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };

  // Les fiches techniques ont leur propre drapeau (recipes/page.tsx gate sur
  // canAccessRecipes). Aujourd'hui les deux basculent au meme palier, mais gater
  // sur canAccessInventory rouvrirait le trou le jour ou la grille tarifaire les
  // separe - c'est exactement ce genre d'ecart qui a cree ce constat.
  const { error: permError, supabase } = await checkInventoryPermissions(
    tenantId,
    'canAccessRecipes',
    RECIPES_PLAN_ERROR,
  );
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
  if (!parsed.success) return { error: invalidInputMessage(parsed.error) };

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
