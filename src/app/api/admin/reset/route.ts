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

    // tenantId already derived from session above

    // 5. Execute reset based on type
    switch (resetType) {
      case 'orders': {
        // Delete order items first (FK constraint), then orders
        // Batch deletes in chunks of 200 to avoid Supabase URL/query limits
        const { data: orderData } = await adminSupabase
          .from('orders')
          .select('id')
          .eq('tenant_id', tenantId);
        const orderIdsForItems = orderData?.map((o) => o.id) || [];
        for (let i = 0; i < orderIdsForItems.length; i += 200) {
          const batch = orderIdsForItems.slice(i, i + 200);
          const { error: itemsErr } = await adminSupabase
            .from('order_items')
            .delete()
            .in('order_id', batch);
          if (itemsErr) {
            logger.error('Reset: Failed to delete order items batch', itemsErr);
          }
        }

        const { error: ordersErr, count } = await adminSupabase
          .from('orders')
          .delete({ count: 'exact' })
          .eq('tenant_id', tenantId);

        if (ordersErr) {
          logger.error('Reset: Failed to delete orders', ordersErr);
          return NextResponse.json(
            { error: 'Erreur lors de la suppression des commandes' },
            { status: 500 },
          );
        }

        logger.info(`Reset: Deleted ${count} orders for tenant ${tenantId} by user ${user.id}`);
        return NextResponse.json({
          success: true,
          message: `${count || 0} commandes supprimées avec succès.`,
          resetType,
        });
      }

      case 'statistics': {
        // Reset only delivered/completed orders (keeps pending ones)
        const { data: deliveredOrders } = await adminSupabase
          .from('orders')
          .select('id')
          .eq('tenant_id', tenantId)
          .in('status', ['delivered', 'cancelled']);

        const orderIds = deliveredOrders?.map((o) => o.id) || [];

        if (orderIds.length > 0) {
          // Batch deletes in chunks of 200 to avoid Supabase URL/query limits
          for (let i = 0; i < orderIds.length; i += 200) {
            const batch = orderIds.slice(i, i + 200);
            await adminSupabase.from('order_items').delete().in('order_id', batch);
          }
          let count = 0;
          for (let i = 0; i < orderIds.length; i += 200) {
            const batch = orderIds.slice(i, i + 200);
            const { count: batchCount } = await adminSupabase
              .from('orders')
              .delete({ count: 'exact' })
              .in('id', batch);
            count += batchCount || 0;
          }

          logger.info(
            `Reset stats: Deleted ${count} delivered/cancelled orders for tenant ${tenantId}`,
          );
          return NextResponse.json({
            success: true,
            message: `${count || 0} commandes livrées/annulées supprimées. Les commandes en cours sont conservées.`,
            resetType,
          });
        }

        return NextResponse.json({
          success: true,
          message: 'Aucune commande livrée/annulée à supprimer.',
          resetType,
        });
      }

      case 'all': {
        // Full reset: orders + order items + inventory movements + coupon usage
        const { data: allOrders } = await adminSupabase
          .from('orders')
          .select('id')
          .eq('tenant_id', tenantId);

        const orderIds = allOrders?.map((o) => o.id) || [];

        if (orderIds.length > 0) {
          // Batch deletes in chunks of 200 to avoid Supabase URL/query limits
          for (let i = 0; i < orderIds.length; i += 200) {
            const batch = orderIds.slice(i, i + 200);
            await adminSupabase.from('order_items').delete().in('order_id', batch);
          }
        }

        const { count: ordersCount } = await adminSupabase
          .from('orders')
          .delete({ count: 'exact' })
          .eq('tenant_id', tenantId);

        // Reset inventory movements
        await adminSupabase.from('inventory_movements').delete().eq('tenant_id', tenantId);

        // Reset coupon usage counts
        await adminSupabase.from('coupons').update({ current_uses: 0 }).eq('tenant_id', tenantId);

        logger.info(
          `Reset all: Full data reset for tenant ${tenantId} by user ${user.id} - ${ordersCount} orders deleted`,
        );
        return NextResponse.json({
          success: true,
          message: `Réinitialisation complète effectuée : ${ordersCount || 0} commandes, mouvements de stock et compteurs de coupons réinitialisés.`,
          resetType,
        });
      }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Reset API error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
