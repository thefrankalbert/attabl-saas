'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { isFeatureEntitled } from '@/lib/plans/assert-feature';
import { createTableConfigService } from '@/services/table-config.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';
import { zoneSchema } from '@/lib/validations/table-config.schema';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const zoneIdSchema = z.string().uuid();
const tableIdSchema = z.string().uuid();
const venueIdSchema = z.string().uuid();

// Le plan de salle est une fonctionnalite Pro (settings/tables/page.tsx gate deja
// sur canAccessTables). Une Server Action est un endpoint POST adressable par son
// Action ID: sans cette garde, un tenant Starter creait zones et tables sans
// jamais voir l'ecran.
const TABLES_PLAN_ERROR = 'Le plan de salle est reserve au plan Pro.';

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      tenantId,
      ['owner', 'admin', 'manager'],
      'orders.manage',
    );
    // Coupure du restaurant: toute action de ce fichier est une ecriture.
    await assertTenantServing(tenantId);
    if (!(await isFeatureEntitled(supabase, tenantId, 'canAccessTables'))) {
      return { error: TABLES_PLAN_ERROR };
    }
    return { error: null };
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) {
      return { error: err.message };
    }
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    return { error: 'Permissions insuffisantes' };
  }
}

/**
 * SECURITY: Session membership verified before creating zone.
 * The service guards the write by confirming venueId belongs to tenantId,
 * so a foreign venueId is rejected at the app layer (defense beyond RLS).
 */
export async function actionCreateZone(
  tenantId: string,
  venueId: string,
  name: string,
  prefix: string,
  displayOrder: number,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedVenueId = venueIdSchema.safeParse(venueId);
  if (!parsedTenant.success || !parsedVenueId.success) return { error: 'Invalid input' };

  // C-074: un prefixe avec espace ou ponctuation passait (il fabrique le numero
  // de table que le QR recherche). Meme regle que l'onboarding: zoneSchema.
  const parsedName = z
    .string()
    .trim()
    .min(1, 'Le nom de la zone est requis')
    .max(100)
    .safeParse(name);
  const parsedPrefix = zoneSchema.shape.prefix.safeParse(prefix.trim().toUpperCase());
  const parsedOrder = z.number().int().min(0).safeParse(displayOrder);
  if (!parsedName.success) return { error: parsedName.error.issues[0]?.message ?? 'Nom invalide' };
  if (!parsedPrefix.success) {
    return { error: parsedPrefix.error.issues[0]?.message ?? 'Préfixe invalide' };
  }
  if (!parsedOrder.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.createZone(
      tenantId,
      venueId,
      parsedName.data,
      parsedPrefix.data,
      displayOrder,
    );
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before updating zone name.
 * The service guards the write by confirming zoneId belongs to tenantId,
 * so a foreign zoneId is rejected at the app layer (defense beyond RLS).
 */
export async function actionUpdateZoneName(
  tenantId: string,
  zoneId: string,
  name: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedZoneId = zoneIdSchema.safeParse(zoneId);
  if (!parsedTenant.success || !parsedZoneId.success) return { error: 'Invalid input' };

  const parsedName = z
    .string()
    .trim()
    .min(1, 'Le nom de la zone est requis')
    .max(100)
    .safeParse(name);
  if (!parsedName.success) return { error: parsedName.error.issues[0]?.message ?? 'Nom invalide' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.updateZoneName(tenantId, zoneId, parsedName.data);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting zone.
 * The service guards the write by confirming zoneId belongs to tenantId,
 * so a foreign zoneId is rejected at the app layer (defense beyond RLS).
 */
export async function actionDeleteZone(tenantId: string, zoneId: string): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedZoneId = zoneIdSchema.safeParse(zoneId);
  if (!parsedTenant.success || !parsedZoneId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.deleteZone(tenantId, zoneId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

const insertTableRowSchema = z.object({
  zone_id: z.string().uuid(),
  table_number: z.string().min(1).max(20),
  display_name: z.string().min(1).max(100),
  capacity: z.number().int().min(1),
  is_active: z.boolean(),
});

/**
 * SECURITY: Session membership verified before inserting tables.
 * The service guards the write by confirming every target zone_id belongs to
 * tenantId, so a foreign zone_id is rejected at the app layer (defense beyond RLS).
 */
export async function actionInsertTables(
  tenantId: string,
  tables: z.infer<typeof insertTableRowSchema>[],
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedTables = z.array(insertTableRowSchema).min(1).safeParse(tables);
  if (!parsedTables.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.insertTables(tenantId, parsedTables.data);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before toggling table active state.
 * The service guards the write by confirming tableId belongs to tenantId,
 * so a foreign tableId is rejected at the app layer (defense beyond RLS).
 */
export async function actionToggleTableActive(
  tenantId: string,
  tableId: string,
  isActive: boolean,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedTableId = tableIdSchema.safeParse(tableId);
  if (!parsedTenant.success || !parsedTableId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.toggleTableActive(tenantId, tableId, isActive);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before updating table capacity.
 * The service guards the write by confirming tableId belongs to tenantId,
 * so a foreign tableId is rejected at the app layer (defense beyond RLS).
 */
export async function actionUpdateTableCapacity(
  tenantId: string,
  tableId: string,
  capacity: number,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedTableId = tableIdSchema.safeParse(tableId);
  const parsedCapacity = z.number().int().min(1).safeParse(capacity);
  if (!parsedTenant.success || !parsedTableId.success || !parsedCapacity.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.updateTableCapacity(tenantId, tableId, capacity);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before updating table display name.
 * The service guards the write by confirming tableId belongs to tenantId,
 * so a foreign tableId is rejected at the app layer (defense beyond RLS).
 */
export async function actionUpdateTableDisplayName(
  tenantId: string,
  tableId: string,
  displayName: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedTableId = tableIdSchema.safeParse(tableId);
  const parsedName = z.string().min(1).max(100).safeParse(displayName);
  if (!parsedTenant.success || !parsedTableId.success || !parsedName.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.updateTableDisplayName(tenantId, tableId, displayName);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting table.
 * The service guards the write by confirming tableId belongs to tenantId,
 * so a foreign tableId is rejected at the app layer (defense beyond RLS).
 */
export async function actionDeleteTable(
  tenantId: string,
  tableId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedTableId = tableIdSchema.safeParse(tableId);
  if (!parsedTenant.success || !parsedTableId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const tableConfigService = createTableConfigService(supabase);
    await tableConfigService.deleteTable(tenantId, tableId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
