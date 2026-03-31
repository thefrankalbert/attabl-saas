import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { adminResetLimiter, getClientIp } from '@/lib/rate-limit';

/**
 * Reset API — allows high-level admins (owner, admin) to reset specific data.
 * Requires typing a confirmation phrase for safety.
 */

const CONFIRMATION_PHRASE = 'CONFIRMER SUPPRESSION';

const resetSchema = z.object({
  resetType: z.enum(['orders', 'statistics', 'all']),
  confirmationText: z.string(),
});

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await adminResetLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    // 1. Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
    }

    // 2. Verify admin role (owner or admin only)
    const adminSupabase = createAdminClient();
    const { data: tenant } = await adminSupabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Restaurant non trouvé' }, { status: 404 });
    }

    const { data: adminUser } = await adminSupabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .single();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json(
        {
          error:
            'Permissions insuffisantes. Seuls les propriétaires et administrateurs peuvent effectuer cette action.',
        },
        { status: 403 },
      );
    }

    // 3. Parse and validate input
    const body = await request.json();
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

    const tenantId = tenant.id;

    // 5. Execute reset based on type
    switch (resetType) {
      case 'orders': {
        // Delete order items first (FK constraint), then orders
        const { error: itemsErr } = await adminSupabase
          .from('order_items')
          .delete()
          .in(
            'order_id',
            (await adminSupabase.from('orders').select('id').eq('tenant_id', tenantId)).data?.map(
              (o) => o.id,
            ) || [],
          );
        if (itemsErr) {
          logger.error('Reset: Failed to delete order items', itemsErr);
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

        logger.info(`Reset: Deleted ${count} orders for tenant ${tenantSlug} by user ${user.id}`);
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
          await adminSupabase.from('order_items').delete().in('order_id', orderIds);
          const { count } = await adminSupabase
            .from('orders')
            .delete({ count: 'exact' })
            .in('id', orderIds);

          logger.info(
            `Reset stats: Deleted ${count} delivered/cancelled orders for tenant ${tenantSlug}`,
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
          await adminSupabase.from('order_items').delete().in('order_id', orderIds);
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
          `Reset all: Full data reset for tenant ${tenantSlug} by user ${user.id} — ${ordersCount} orders deleted`,
        );
        return NextResponse.json({
          success: true,
          message: `Réinitialisation complète effectuée : ${ordersCount || 0} commandes, mouvements de stock et compteurs de coupons réinitialisés.`,
          resetType,
        });
      }
    }
  } catch (error) {
    logger.error('Reset API error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
