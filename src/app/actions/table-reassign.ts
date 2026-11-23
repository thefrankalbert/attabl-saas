'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing } from '@/lib/billing/assert-tenant-serving';

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

/**
 * Messages francais par cas connu de la fonction SQL (revue L014, A13). Le
 * texte brut (anglais, ou message Postgres de contrainte) n'atteint plus
 * l'employe: il reste dans le journal serveur.
 */
const RPC_MESSAGES: Record<string, string> = {
  'Destination table is now occupied': "Cette table vient d'etre occupee. Choisissez-en une autre.",
  'Order not found': 'Commande introuvable.',
  'Only dine-in orders can be reassigned': 'Seule une commande sur place peut changer de table.',
  'Cannot reassign a cancelled order': 'Une commande annulee ne change pas de table.',
  'Destination table number is required': 'Choisissez la table de destination.',
};

function reassignErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '42501') return 'Votre role ne permet pas de deplacer une commande.';
  return RPC_MESSAGES[error.message ?? ''] ?? 'Le changement de table a echoue. Reessayez.';
}

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
    // Coupure du restaurant: deplacer une commande est une ecriture de service.
    await assertTenantServing(tenantId);

    const { error } = await supabase.rpc('reassign_order_table', {
      p_order_id: parsed.data.orderId,
      p_tenant_id: tenantId,
      p_new_table_number: parsed.data.newTableNumber,
    });

    if (error) {
      logger.error('actionReassignOrderTable: rpc failed', { error, orderId, tenantId });
      return { success: false, error: reassignErrorMessage(error) };
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
