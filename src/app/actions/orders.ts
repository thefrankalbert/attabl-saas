'use server';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

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
  if (!orderIds.length || orderIds.length > 200) {
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

  // Verify admin access for all tenants
  const { data: adminRecords, error: adminError } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .in('tenant_id', tenantIds);

  if (adminError || !adminRecords || adminRecords.length !== tenantIds.length) {
    return { error: 'Unauthorized: not admin for all order tenants' };
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

  return { success: true, deletedCount: foundIds.length };
}
