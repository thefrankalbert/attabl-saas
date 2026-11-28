'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing } from '@/lib/billing/assert-tenant-serving';
import { createOrderService } from '@/services/order.service';
import { ServiceError } from '@/services/errors';

/**
 * Table release (owner decision 2026-11-15, market usage): a table stays
 * occupied while its order is in progress, even paid; staff can free it by
 * hand, and a paid table frees itself after a delay.
 *
 * SECURITY: the tenant comes from the session (never the client). Closing a
 * session needs the service role - RLS keeps table_sessions writes for
 * `orders.pay`, which the waiter does not have - so every write below is
 * explicitly tenant-scoped in the service.
 */

const releaseSchema = z.object({
  tableNumber: z.string().min(1).max(50),
  displayName: z.string().max(100).optional(),
});

/** "Liberer la table" on the Service screen. Refused while money is still due. */
export async function actionReleaseTable(
  tableNumber: string,
  displayName?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = releaseSchema.safeParse({ tableNumber, displayName });
  if (!parsed.success) return { success: false, error: 'Donnees invalides' };

  try {
    // Liberer une table est un geste de salle, pas de cuisine: `orders.take`
    // (`kitchen.track` seul ne suffit pas, constat P1 de l'audit de securite).
    const { tenantId } = await getAuthenticatedUserWithTenant('orders.take');
    await assertTenantServing(tenantId);
    await createOrderService(createAdminClient()).releaseTableSession(
      tenantId,
      parsed.data.tableNumber,
      parsed.data.displayName,
    );
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError || err instanceof ServiceError) {
      return { success: false, error: err.message };
    }
    logger.error('actionReleaseTable: unexpected error', { err });
    return { success: false, error: 'Erreur interne' };
  }
}

/**
 * Frees the tables of the caller's restaurant whose orders are all paid and
 * that have been open longer than the delay. Called when a screen showing
 * occupancy loads. Any active member may trigger it: it only applies the rule.
 */
export async function actionReleaseStaleTables(): Promise<void> {
  try {
    const { tenantId } = await getAuthenticatedUserWithTenant();
    // Frozen restaurant: no write at all, this cleanup included.
    await assertTenantServing(tenantId);
    await createOrderService(createAdminClient()).releaseStaleSessions(tenantId);
  } catch (err) {
    // Not signed in, or restaurant frozen: nothing to clean, never an error
    // on the screen that called it.
    if (err instanceof AuthError || err instanceof ServiceError) return;
    logger.error('actionReleaseStaleTables: unexpected error', { err });
  }
}
