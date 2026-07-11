'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';

/**
 * Reassign a dine-in order to a different table.
 *
 * SECURITY: tenantId is derived from the authenticated session (never from the
 * client) and gated on `orders.manage` - the same permission the order-status /
 * comp actions use - so a member cannot move another tenant's order (IDOR
 * prevention). The atomic table_sessions bookkeeping lives in the
 * reassign_order_table RPC (migration 20260711140000).
 */

const reassignSchema = z.object({
  orderId: z.string().uuid(),
  newTableNumber: z.string().min(1).max(50),
});

export async function actionReassignOrderTable(
  orderId: string,
  newTableNumber: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = reassignSchema.safeParse({ orderId, newTableNumber });
  if (!parsed.success) {
    return { success: false, error: 'Donnees invalides' };
  }

  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('orders.manage');

    const { error } = await supabase.rpc('reassign_order_table', {
      p_order_id: parsed.data.orderId,
      p_tenant_id: tenantId,
      p_new_table_number: parsed.data.newTableNumber,
    });

    if (error) {
      logger.error('actionReassignOrderTable: rpc failed', { error, orderId, tenantId });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { success: false, error: err.message };
    }
    logger.error('actionReassignOrderTable: unexpected error', { err, orderId });
    return { success: false, error: 'Erreur interne' };
  }
}
