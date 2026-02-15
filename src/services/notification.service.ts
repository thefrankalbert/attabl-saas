/**
 * Notification Service — Stock alert checks and email dispatch
 *
 * Uses createAdminClient() to bypass RLS since this may be triggered
 * from customer order context (not admin).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendStockAlertEmail } from '@/services/email.service';

interface StockAlertRow {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
}

/**
 * Check for low/out-of-stock ingredients and send email notifications.
 * Rate-limited: max 1 email per ingredient per hour.
 */
export async function checkAndNotifyLowStock(tenantId: string): Promise<void> {
  const supabase = createAdminClient();

  // 1. Fetch ingredients that are low or out of stock
  const { data: ingredients, error: ingError } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, min_stock_alert')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .or('current_stock.lte.0,current_stock.lte.min_stock_alert');

  if (ingError || !ingredients || ingredients.length === 0) return;

  // Filter to only genuinely low/out items
  const alertItems = (ingredients as StockAlertRow[]).filter(
    (ing) => ing.current_stock <= 0 || ing.current_stock <= ing.min_stock_alert,
  );

  if (alertItems.length === 0) return;

  // 2. Rate-limit check: exclude ingredients already notified within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ingredientIds = alertItems.map((i) => i.id);

  const { data: recentAlerts } = await supabase
    .from('stock_alert_notifications')
    .select('ingredient_id')
    .eq('tenant_id', tenantId)
    .in('ingredient_id', ingredientIds)
    .gte('sent_at', oneHourAgo);

  const alreadyNotified = new Set((recentAlerts || []).map((a) => a.ingredient_id));
  const itemsToNotify = alertItems.filter((i) => !alreadyNotified.has(i.id));

  if (itemsToNotify.length === 0) return;

  // 3. Fetch admin emails for this tenant
  const { data: adminUsers } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('tenant_id', tenantId);

  if (!adminUsers || adminUsers.length === 0) return;

  const userIds = adminUsers.map((au) => au.user_id);

  // Fetch emails from auth.users via admin API
  const emails: string[] = [];
  for (const userId of userIds) {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email) {
      emails.push(userData.user.email);
    }
  }

  if (emails.length === 0) return;

  // 4. Fetch tenant info for email
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .single();

  if (!tenant) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
  const dashboardUrl = `${appUrl}/sites/${tenant.slug}/admin/inventory`;

  // 5. Send email
  const emailItems = itemsToNotify.map((i) => ({
    name: i.name,
    unit: i.unit,
    current_stock: i.current_stock,
    min_stock_alert: i.min_stock_alert,
    is_out: i.current_stock <= 0,
  }));

  const sent = await sendStockAlertEmail(emails, {
    tenantName: tenant.name,
    items: emailItems,
    dashboardUrl,
  });

  if (!sent) return;

  // 6. Record notifications for rate-limiting
  const notificationRows = itemsToNotify.map((i) => ({
    tenant_id: tenantId,
    ingredient_id: i.id,
    alert_type: i.current_stock <= 0 ? 'out_of_stock' : 'low_stock',
    sent_to: emails,
  }));

  await supabase.from('stock_alert_notifications').insert(notificationRows);
}
