'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { createAuditService } from '@/services/audit.service';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createOrderService } from '@/services/order.service';
import { ServiceError } from '@/services/errors';

const deleteOrdersSchema = z.array(z.string().uuid()).min(1).max(200);

const updateOrderStatusSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'preparing', 'ready', 'delivered', 'cancelled']),
});

const markOrderPaidSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  method: z.string().min(1).max(50),
  tipAmount: z.number().min(0).optional(),
});

const updateItemStatusSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(['pending', 'preparing', 'ready', 'served']),
});

type ActionResponse = {
  success?: boolean;
  error?: string;
  deletedCount?: number;
};

/**
 * Deletes orders by their IDs.
 * Verifies the current user is an admin for the tenant owning the orders.
 * Deletes associated order_items first, then the orders themselves.
 */
export async function actionDeleteOrders(orderIds: string[]): Promise<ActionResponse> {
  const parsed = deleteOrdersSchema.safeParse(orderIds);
  if (!parsed.success) {
    return { error: 'Invalid order IDs' };
  }

  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Verify the user is an admin for the tenant(s) of these orders
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, tenant_id')
    .in('id', orderIds);

  if (fetchError) {
    logger.error('Failed to fetch orders for deletion', fetchError, { orderIds });
    return { error: fetchError.message };
  }

  if (!orders || orders.length === 0) {
    return { error: 'No orders found or access denied' };
  }

  // Get the tenant IDs involved
  const tenantIds = [...new Set(orders.map((o) => o.tenant_id))];

  // Verify admin access for all tenants (owner/admin only - privilege escalation prevention)
  const { data: adminRecords, error: adminError } = await supabase
    .from('admin_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .in('tenant_id', tenantIds)
    .in('role', ['owner', 'admin']);

  if (adminError || !adminRecords || adminRecords.length !== tenantIds.length) {
    return { error: 'Unauthorized: requires owner or admin role' };
  }

  const foundIds = orders.map((o) => o.id);

  // Step 1: Delete order_items for these orders
  const { error: itemsError } = await supabase
    .from('order_items')
    .delete()
    .in('order_id', foundIds);

  if (itemsError) {
    logger.error('Failed to delete order_items', itemsError, { orderIds: foundIds });
    return { error: `Failed to delete order items: ${itemsError.message}` };
  }

  // Step 2: Delete the orders
  const { error: deleteError } = await supabase.from('orders').delete().in('id', foundIds);

  if (deleteError) {
    logger.error('Failed to delete orders', deleteError, { orderIds: foundIds });
    return { error: `Failed to delete orders: ${deleteError.message}` };
  }

  logger.info('Orders deleted successfully', { count: foundIds.length, orderIds: foundIds });

  // Fire-and-forget audit log for each tenant
  for (const tid of tenantIds) {
    const idsForTenant = orders.filter((o) => o.tenant_id === tid).map((o) => o.id);
    const audit = createAuditService(supabase, {
      tenantId: tid,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });
    audit.log({
      action: 'delete',
      entityType: 'order',
      oldData: { orderIds: idsForTenant },
    });
  }

  return { success: true, deletedCount: foundIds.length };
}

/**
 * Updates the status of an order.
 * Verifies the current user is a staff member (server or above) for the tenant.
 */
export async function actionUpdateOrderStatus(
  tenantId: string,
  orderId: string,
  status: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsed = updateOrderStatusSchema.safeParse({ tenantId, orderId, status });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(parsed.data.tenantId, [
      'owner',
      'admin',
      'manager',
      'server',
    ]);
    await createOrderService(supabase).updateStatus(
      parsed.data.orderId,
      parsed.data.tenantId,
      parsed.data.status,
    );
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionUpdateOrderStatus: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}

/**
 * Updates the kitchen item_status of one or more order_items belonging to an order.
 * order_items has no tenant_id column, so isolation is enforced by first verifying
 * the order belongs to the tenant (session-bound), then scoping the write by order_id:
 * a foreign itemId cannot be written because it would not match order_id of a
 * tenant-owned order.
 */
export async function actionUpdateItemStatus(
  tenantId: string,
  orderId: string,
  itemIds: string[],
  status: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsed = updateItemStatusSchema.safeParse({ tenantId, orderId, itemIds, status });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(parsed.data.tenantId, [
      'owner',
      'admin',
      'manager',
      'server',
    ]);

    // Verify the order belongs to the verified tenant before touching its items.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', parsed.data.orderId)
      .eq('tenant_id', parsed.data.tenantId)
      .maybeSingle();

    if (orderError) {
      logger.error('actionUpdateItemStatus: order lookup failed', orderError, {
        tenantId,
        orderId,
      });
      return { error: 'Erreur interne' };
    }
    if (!order) {
      return { error: 'Commande introuvable' };
    }

    // Scope the write by order_id (tenant-owned) AND the targeted item ids.
    const { error: updateError } = await supabase
      .from('order_items')
      .update({ item_status: parsed.data.status })
      .eq('order_id', parsed.data.orderId)
      .in('id', parsed.data.itemIds);

    if (updateError) {
      logger.error('actionUpdateItemStatus: update failed', updateError, { tenantId, orderId });
      return { error: 'Erreur interne' };
    }
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    logger.error('actionUpdateItemStatus: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}

/**
 * Marks an order as paid.
 * Verifies the current user is a staff member (server or above) for the tenant.
 */
export async function actionMarkOrderPaid(
  tenantId: string,
  orderId: string,
  method: string,
  tipAmount?: number,
): Promise<{ success?: boolean; error?: string }> {
  const parsed = markOrderPaidSchema.safeParse({ tenantId, orderId, method, tipAmount });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(parsed.data.tenantId, [
      'owner',
      'admin',
      'manager',
      'server',
    ]);
    await createOrderService(supabase).markPaid(parsed.data.orderId, parsed.data.tenantId, {
      method: parsed.data.method,
      tipAmount: parsed.data.tipAmount,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionMarkOrderPaid: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}
