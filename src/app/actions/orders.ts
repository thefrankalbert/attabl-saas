'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { createAuditService } from '@/services/audit.service';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createOrderService } from '@/services/order.service';
import { createPaymentService, type PaymentSummary } from '@/services/payment.service';
import { createInventoryService } from '@/services/inventory.service';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import type { PaymentStatus } from '@/types/admin.types';
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

const paymentSummarySchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
});

const recordTenderSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1).max(50),
});

const refundOrderSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1).max(50),
});

const updateItemStatusSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(['pending', 'preparing', 'ready', 'served']),
});

const setCourseHeldSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  course: z.enum(['appetizer', 'main', 'dessert', 'drink']),
  held: z.boolean(),
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

  // Verify the user is an admin for the tenant(s) of these orders.
  // Pull the financial fields too: paid orders may not be hard-deleted (they are
  // the financial record), and any deletion is snapshotted into the audit log.
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, tenant_id, order_number, status, payment_status, total, tip_amount, paid_at')
    .in('id', orderIds);

  if (fetchError) {
    logger.error('Failed to fetch orders for deletion', fetchError, { orderIds });
    return { error: fetchError.message };
  }

  if (!orders || orders.length === 0) {
    return { error: 'No orders found or access denied' };
  }

  // Never destroy the financial record of a settled order (audit C7). Paid orders
  // must be voided/refunded (Phase 4), not deleted.
  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  if (paidOrders.length > 0) {
    return {
      error:
        'Impossible de supprimer une commande payee. Une commande reglee fait partie de l historique financier.',
    };
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

  // Fire-and-forget audit log for each tenant. Snapshot the financial fields of
  // each deleted order so the record is reconstructable (audit C7) - the row is
  // gone but its totals survive in the audit trail.
  for (const tid of tenantIds) {
    const ordersForTenant = orders.filter((o) => o.tenant_id === tid);
    const audit = createAuditService(supabase, {
      tenantId: tid,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });
    audit.log({
      action: 'delete',
      entityType: 'order',
      oldData: {
        orderIds: ordersForTenant.map((o) => o.id),
        orders: ordersForTenant.map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          payment_status: o.payment_status,
          total: o.total,
          tip_amount: o.tip_amount,
          paid_at: o.paid_at,
        })),
      },
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
    const { supabase, user } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    const service = createOrderService(supabase);
    if (parsed.data.status === 'cancelled') {
      // Cancellation reverses side-effects (audit C7), in two halves by design:
      //  - cancelOrder (authenticated): refuse a paid order, release the coupon,
      //    set status='cancelled'.
      //  - stock restock via the canonical service_role path (main's stock-integrity
      //    feature): restock_order is service_role-only, so it runs via the admin
      //    client + inventory.service, gated by the inventory plan feature. Non-blocking.
      await service.cancelOrder(parsed.data.orderId, parsed.data.tenantId);

      const { data: tenant } = await supabase
        .from('tenants')
        .select('subscription_plan, subscription_status, trial_ends_at')
        .eq('id', parsed.data.tenantId)
        .maybeSingle();

      const hasInventory =
        !!tenant &&
        canAccessFeature(
          'canAccessInventory',
          tenant.subscription_plan as SubscriptionPlan | null,
          tenant.subscription_status as SubscriptionStatus | null,
          tenant.trial_ends_at as string | null,
        );

      if (hasInventory) {
        const adminSupabase = createAdminClient();
        createInventoryService(adminSupabase)
          .restockOrder(parsed.data.orderId, parsed.data.tenantId, user.id)
          .catch((err) => {
            logger.error('Order cancel: auto-restock failed (non-blocking)', {
              err,
              orderId: parsed.data.orderId,
            });
            Sentry.captureException(err, {
              tags: { area: 'inventory-restock' },
              extra: { orderId: parsed.data.orderId, tenantId: parsed.data.tenantId },
            });
          });
      }
    } else {
      await service.updateStatus(parsed.data.orderId, parsed.data.tenantId, parsed.data.status);
    }
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
    const { supabase } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );

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
 * Hold or fire a whole course of an order (KDS coursing).
 */
export async function actionSetCourseHeld(
  tenantId: string,
  orderId: string,
  course: string,
  held: boolean,
): Promise<{ success?: boolean; error?: string }> {
  const parsed = setCourseHeldSchema.safeParse({ tenantId, orderId, course, held });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    await createOrderService(supabase).setCourseHeld(
      parsed.data.orderId,
      parsed.data.tenantId,
      parsed.data.course,
      parsed.data.held,
    );
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionSetCourseHeld: unexpected error', { err, tenantId, orderId });
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
): Promise<{ success?: boolean; paid?: boolean; error?: string }> {
  const parsed = markOrderPaidSchema.safeParse({ tenantId, orderId, method, tipAmount });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    // paid=false means the order was already settled (idempotent no-op). The call
    // still succeeds; callers can use `paid` to skip duplicate side-effects.
    const { paid } = await createOrderService(supabase).markPaid(
      parsed.data.orderId,
      parsed.data.tenantId,
      {
        method: parsed.data.method,
        tipAmount: parsed.data.tipAmount,
      },
    );
    return { success: true, paid };
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

/**
 * Record one split / partial tender against an order. Multiple calls accumulate
 * in the append-only payments ledger; the order's payment_status is recomputed
 * (pending -> partial -> paid) after each tender. Staff (server or above).
 */
export async function actionRecordTender(
  tenantId: string,
  orderId: string,
  amount: number,
  method: string,
): Promise<{
  success?: boolean;
  paymentStatus?: PaymentStatus;
  net?: number;
  due?: number;
  error?: string;
}> {
  const parsed = recordTenderSchema.safeParse({ tenantId, orderId, amount, method });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase, adminUserId } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    const summary = await createPaymentService(supabase).recordTender(
      parsed.data.orderId,
      parsed.data.tenantId,
      {
        amount: parsed.data.amount,
        method: parsed.data.method,
        createdBy: adminUserId,
      },
    );
    return {
      success: true,
      paymentStatus: summary.paymentStatus,
      net: summary.net,
      due: summary.due,
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionRecordTender: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}

/**
 * Refund part or all of an order's net settled amount. Inserts an offsetting
 * ledger row and recomputes payment_status (-> partial or refunded). Refunds are
 * a manager action, so plain 'server' is excluded.
 */
export async function actionRefundOrder(
  tenantId: string,
  orderId: string,
  amount: number,
  method: string,
): Promise<{ success?: boolean; paymentStatus?: PaymentStatus; error?: string }> {
  const parsed = refundOrderSchema.safeParse({ tenantId, orderId, amount, method });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase, adminUserId } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager'],
      'orders.manage',
    );
    const summary = await createPaymentService(supabase).refund(
      parsed.data.orderId,
      parsed.data.tenantId,
      {
        amount: parsed.data.amount,
        method: parsed.data.method,
        createdBy: adminUserId,
      },
    );
    return { success: true, paymentStatus: summary.paymentStatus };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionRefundOrder: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}

/**
 * Read the payment ledger summary for an order (amount due, net settled, status,
 * the list of tenders). Used by the order detail payment panel. Staff (server or
 * above) - read-only.
 */
export async function actionGetPaymentSummary(
  tenantId: string,
  orderId: string,
): Promise<{ summary?: PaymentSummary; error?: string }> {
  const parsed = paymentSummarySchema.safeParse({ tenantId, orderId });
  if (!parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsed.data.tenantId,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    const summary = await createPaymentService(supabase).getSummary(
      parsed.data.orderId,
      parsed.data.tenantId,
    );
    return { summary };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.message };
    }
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    logger.error('actionGetPaymentSummary: unexpected error', { err, tenantId, orderId });
    return { error: 'Erreur interne' };
  }
}
