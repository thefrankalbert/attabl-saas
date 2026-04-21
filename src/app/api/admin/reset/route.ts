import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { adminResetLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';

/**
 * Reset API - allows high-level admins (owner, admin) to reset specific data.
 * Requires typing a confirmation phrase for safety.
 */

const CONFIRMATION_PHRASE = 'CONFIRMER SUPPRESSION';

const resetSchema = z.object({
  resetType: z.enum(['orders', 'statistics', 'all']),
  confirmationText: z.string(),
});

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await adminResetLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 1. Auth + tenant from session (IDOR prevention)
    const { tenantId, user, role } = await getAuthenticatedUserWithTenant();

    // 2. Only owner/admin can reset
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json(
        {
          error:
            'Permissions insuffisantes. Seuls les proprietaires et administrateurs peuvent effectuer cette action.',
        },
        { status: 403 },
      );
    }

    const adminSupabase = createAdminClient();

    // 3. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }
    const parseResult = resetSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const { resetType, confirmationText } = parseResult.data;

    // 4. Verify confirmation phrase
    if (confirmationText.trim() !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          error: `Texte de confirmation incorrect. Veuillez taper exactement : "${CONFIRMATION_PHRASE}"`,
        },
        { status: 400 },
      );
    }

    // tenantId already derived from session above.
    // Single atomic SQL transaction via the reset_tenant_data RPC.
    // Replaces the previous 3-4 batched JS deletes that could leave the
    // tenant in a partial state if the Vercel function runtime timed out
    // between batches (order_items orphaned, coupon counters not reset,
    // etc.). See migration 20260421000000_admin_reset_rpc.sql.
    const { data: resetResult, error: rpcError } = await adminSupabase.rpc('reset_tenant_data', {
      p_tenant_id: tenantId,
      p_reset_type: resetType,
    });

    if (rpcError) {
      logger.error('Reset RPC failed', rpcError, { tenantId, resetType, userId: user.id });
      return NextResponse.json(
        { error: 'Erreur lors de la reinitialisation des donnees' },
        { status: 500 },
      );
    }

    const summary = (resetResult || {}) as {
      orders_deleted?: number;
      items_deleted?: number;
      movements_deleted?: number;
      coupons_reset?: number;
    };

    logger.info('Reset completed', {
      tenantId,
      resetType,
      userId: user.id,
      ...summary,
    });

    switch (resetType) {
      case 'orders':
        return NextResponse.json({
          success: true,
          message: `${summary.orders_deleted ?? 0} commandes supprimées avec succès.`,
          resetType,
        });

      case 'statistics': {
        const n = summary.orders_deleted ?? 0;
        return NextResponse.json({
          success: true,
          message:
            n > 0
              ? `${n} commandes livrées/annulées supprimées. Les commandes en cours sont conservées.`
              : 'Aucune commande livrée/annulée à supprimer.',
          resetType,
        });
      }

      case 'all':
        return NextResponse.json({
          success: true,
          message: `Réinitialisation complète effectuée : ${summary.orders_deleted ?? 0} commandes, mouvements de stock et compteurs de coupons réinitialisés.`,
          resetType,
        });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Reset API error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
