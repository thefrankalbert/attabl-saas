'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryService } from '@/services/inventory.service';
import { ServiceError } from '@/services/errors';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import {
  openStockCountSchema,
  saveStockCountLinesSchema,
  commitStockCountSchema,
  cancelStockCountSchema,
} from '@/lib/validations/stock-count.schema';
import type { OpenStockCountInput, StockCountLineInput } from '@/types/inventory.types';

const ALLOWED_ROLES = ['owner', 'admin', 'manager'] as const;

type ActionResult<T = undefined> =
  | { success: true; data?: T; error?: never }
  | { success?: never; error: string };

async function checkStockCountPermissions(
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
 * SECURITY: Opens a new physical stock count for the tenant.
 * Session membership verified server-side; tenant_id derived from session.
 */
export async function actionOpenStockCount(
  tenantId: string,
  input: OpenStockCountInput,
): Promise<ActionResult<string>> {
  const parsed = openStockCountSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) return { error: 'Donnees invalides' };

  const { error: permError, supabase } = await checkStockCountPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    const data = await service.openStockCount(tenantId, {
      reference: parsed.data.reference,
      ingredientIds: parsed.data.ingredientIds,
    });
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Saves (upserts) counted quantities for an open stock count.
 * Session membership verified server-side.
 */
export async function actionSaveStockCountLines(
  tenantId: string,
  countId: string,
  lines: StockCountLineInput[],
): Promise<ActionResult> {
  const parsed = saveStockCountLinesSchema.safeParse({ tenantId, countId, lines });
  if (!parsed.success) return { error: 'Donnees invalides' };

  const { error: permError, supabase } = await checkStockCountPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.saveStockCountLines(tenantId, countId, parsed.data.lines);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Commits (closes and applies) a stock count.
 * Session membership verified server-side.
 */
export async function actionCommitStockCount(
  tenantId: string,
  countId: string,
): Promise<ActionResult<number>> {
  const parsed = commitStockCountSchema.safeParse({ tenantId, countId });
  if (!parsed.success) return { error: 'Donnees invalides' };

  const { error: permError, supabase } = await checkStockCountPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    const data = await service.commitStockCount(tenantId, countId);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Cancels an open stock count.
 * Session membership verified server-side.
 */
export async function actionCancelStockCount(
  tenantId: string,
  countId: string,
): Promise<ActionResult> {
  const parsed = cancelStockCountSchema.safeParse({ tenantId, countId });
  if (!parsed.success) return { error: 'Donnees invalides' };

  const { error: permError, supabase } = await checkStockCountPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createInventoryService(supabase);
    await service.cancelStockCount(tenantId, countId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}
