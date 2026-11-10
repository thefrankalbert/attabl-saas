/**
 * Notification Service - Stock alert checks and email dispatch
 *
 * Uses createAdminClient() to bypass RLS since this may be triggered
 * from customer order context (not admin).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { createPushService } from '@/services/push.service';
import { sendStockAlertEmail } from '@/services/email.service';
import { logger } from '@/lib/logger';

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

  // 1. Fetch active ingredients for the tenant.
  // The low/out comparison is column-vs-column (current_stock <= min_stock_alert),
  // which PostgREST cannot express in a filter, so we narrow in JS below.
  const { data: ingredients, error: ingError } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, min_stock_alert')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (ingError) {
    logger.error('checkAndNotifyLowStock: failed to fetch ingredients', {
      tenantId,
      error: ingError,
    });
    return;
  }
  if (!ingredients || ingredients.length === 0) return;

  // Filter to only genuinely low/out items
  const alertItems = (ingredients as StockAlertRow[]).filter(
    (ing) => ing.current_stock <= 0 || ing.current_stock <= ing.min_stock_alert,
  );

  if (alertItems.length === 0) return;

  // 2. Rate-limit check: exclude ingredients already notified within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ingredientIds = alertItems.map((i) => i.id);

  const { data: recentAlerts, error: recentError } = await supabase
    .from('stock_alert_notifications')
    .select('ingredient_id')
    .eq('tenant_id', tenantId)
    .in('ingredient_id', ingredientIds)
    .gte('sent_at', oneHourAgo);

  // Fail-safe: if the rate-limit state is unknown, skip this run rather than
  // risk re-sending the same alert emails.
  if (recentError) {
    logger.error('checkAndNotifyLowStock: failed to fetch recent alerts', {
      tenantId,
      error: recentError,
    });
    return;
  }

  const alreadyNotified = new Set((recentAlerts || []).map((a) => a.ingredient_id));
  const itemsToNotify = alertItems.filter((i) => !alreadyNotified.has(i.id));

  if (itemsToNotify.length === 0) return;

  // 3. Fetch admin emails for this tenant
  const { data: adminUsers, error: adminUsersError } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('tenant_id', tenantId);

  if (adminUsersError) {
    logger.error('checkAndNotifyLowStock: failed to fetch admin users', {
      tenantId,
      error: adminUsersError,
    });
    return;
  }
  if (!adminUsers || adminUsers.length === 0) return;

  const userIds = adminUsers.map((au) => au.user_id);

  // Fetch emails directly from admin_users table (avoids auth API pagination issues)
  const { data: emailData, error: emailError } = await supabase
    .from('admin_users')
    .select('email')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds)
    .not('email', 'is', null);

  if (emailError) {
    logger.error('checkAndNotifyLowStock: failed to fetch admin emails', {
      tenantId,
      error: emailError,
    });
    return;
  }

  const emails = (emailData || []).map((u) => u.email).filter(Boolean) as string[];

  if (emails.length === 0) return;

  // 4. Fetch tenant info for email
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .single();

  if (tenantError) {
    logger.error('checkAndNotifyLowStock: failed to fetch tenant', {
      tenantId,
      error: tenantError,
    });
    return;
  }
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

  // 6. Create in-app notifications so NotificationCenter picks them up via realtime
  // Batched into a single INSERT to avoid N+1 round-trips
  const notifRows = itemsToNotify.map((ingredient) => ({
    tenant_id: tenantId,
    user_id: null,
    type: 'stock_alert',
    title: `Alerte stock: ${ingredient.name}`,
    body: `Stock bas: ${ingredient.current_stock} ${ingredient.unit} restant(s)`,
    read: false,
  }));

  const { error: notifInsertError } = await supabase.from('notifications').insert(notifRows);
  if (notifInsertError) {
    logger.error('checkAndNotifyLowStock: failed to insert in-app notifications', {
      tenantId,
      error: notifInsertError,
    });
  }

  // 6bis. Push: reveiller les appareils.
  //
  // C'EST LE CAS QUI COMPTE LE PLUS. Un ingredient en rupture en plein service
  // est l'urgence type: la ligne dans l'application ne se voit que si quelqu'un
  // regarde l'ecran, et l'email arrive dans une boite que personne ne consulte
  // pendant un coup de feu. Sans push, l'alerte existait sans alerter.
  try {
    const premier = itemsToNotify[0];
    const titre =
      itemsToNotify.length === 1
        ? `Stock bas: ${premier.name}`
        : `Stock bas: ${itemsToNotify.length} ingredients`;
    const corps =
      itemsToNotify.length === 1
        ? `${premier.current_stock} ${premier.unit} restant(s)`
        : itemsToNotify
            .slice(0, 3)
            .map((i) => i.name)
            .join(', ') + (itemsToNotify.length > 3 ? '...' : '');

    await createPushService(supabase).envoyerAuxAppareilsDuTenant(tenantId, {
      titre,
      corps,
      // Un tag par alerte: deux notifications de meme tag se remplacent, et
      // sans `renotify` la seconde ne fait aucun bruit. La verification est
      // limitee a une fois par heure et par ingredient, mais deux ingredients
      // differents ne doivent pas s'effacer l'un l'autre.
      tag: `stock-${Date.now()}`,
      url: '/inventory',
      slug: tenant.slug as string,
    });
  } catch (erreurPush) {
    // Une alerte de stock ne doit pas tomber parce qu'un push a echoue.
    logger.error('checkAndNotifyLowStock: envoi push impossible', { tenantId, erreurPush });
  }

  // 7. Record notifications for rate-limiting
  const notificationRows = itemsToNotify.map((i) => ({
    tenant_id: tenantId,
    ingredient_id: i.id,
    alert_type: i.current_stock <= 0 ? 'out_of_stock' : 'low_stock',
    sent_to: emails,
  }));

  // If this insert fails, the rate-limit record is missing and the next check
  // would re-send the same emails - surface it instead of swallowing it.
  const { error: rateLimitInsertError } = await supabase
    .from('stock_alert_notifications')
    .insert(notificationRows);
  if (rateLimitInsertError) {
    logger.error('checkAndNotifyLowStock: failed to record sent alerts', {
      tenantId,
      error: rateLimitInsertError,
    });
  }
}

/**
 * Tell the restaurant that an order was served WITHOUT its ingredients being
 * deducted.
 *
 * Why this exists: the destock is deliberately non-blocking (an order must never
 * be refused because the stock engine stumbled), and `destock_order` aborts the
 * WHOLE call as soon as one recipe line is short. Until this function existed,
 * that outcome was written to the logs and to Sentry only - nobody in the
 * restaurant was told. The dish went out, the stock screen kept showing the old
 * figure, and the gap was discovered at the next physical count, with no way to
 * tell which order caused it. Written with `user_id: null`, so it reaches every
 * staff member of the restaurant, like the low-stock alert - the person holding
 * the phone during service is not always the owner.
 *
 * Never throws: it is itself the error path.
 */
/** Title prefix used BOTH to write and to de-duplicate the warning. */
const DESTOCK_FAILED_TITLE_PREFIX = 'Stock non deduit - commande';

export async function notifyDestockFailed(params: {
  tenantId: string;
  orderId: string;
  /** True when the deduction was refused for lack of stock (the usual cause). */
  outOfStock: boolean;
}): Promise<void> {
  const { tenantId, orderId, outOfStock } = params;
  try {
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const label = (order?.order_number as string | undefined) ?? orderId.slice(0, 8);

    // In a rush with one ingredient at zero, EVERY order fails to deduct: a row
    // per order would bury the notification centre and teach the staff to ignore
    // it. So: at most one UNACKNOWLEDGED warning per restaurant per 15 minutes.
    // Acknowledging it re-arms the alert - otherwise a second, unrelated failure
    // two minutes later would be swallowed in silence. Since 20261109210000
    // "read" is per person: the latest warning counts as acknowledged as soon as
    // ONE member has read it (a notification_reads row), or, for older rows,
    // when the legacy shared flag is set.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // Matched on the title prefix, not a new `type`: NotificationCenter maps
    // icons and colours over a CLOSED union of types, so an unknown one would
    // render blank. 'stock_alert' is already the right bucket.
    const { data: recent } = await supabase
      .from('notifications')
      .select('id, read, notification_reads(user_id)')
      .eq('tenant_id', tenantId)
      .eq('type', 'stock_alert')
      .like('title', `${DESTOCK_FAILED_TITLE_PREFIX}%`)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = recent?.[0] as
      | { read?: boolean | null; notification_reads?: { user_id: string }[] | null }
      | undefined;
    if (latest && !latest.read && (latest.notification_reads?.length ?? 0) === 0) {
      logger.warn('notifyDestockFailed: deja signale recemment, pas de doublon', {
        tenantId,
        orderId,
      });
      return;
    }

    const { error } = await supabase.from('notifications').insert({
      tenant_id: tenantId,
      user_id: null,
      type: 'stock_alert',
      title: `${DESTOCK_FAILED_TITLE_PREFIX} ${label}`,
      body: outOfStock
        ? "Le stock d'un ingredient de cette commande etait insuffisant: aucun ingredient n'a ete deduit. Reapprovisionnez, puis corrigez le stock a la main."
        : "Les ingredients de cette commande n'ont pas pu etre deduits. Verifiez le stock a la main.",
      // /inventory, NOT /stock-history: a deduction that FAILED has, by
      // definition, no line in the history - sending the owner there would show
      // them nothing. The actionable screen is the stock itself.
      link: '/inventory',
      read: false,
    });
    if (error) {
      logger.error('notifyDestockFailed: insert notification impossible', {
        tenantId,
        orderId,
        error,
      });
    }
  } catch (err) {
    logger.error('notifyDestockFailed: echec', { tenantId, orderId, err });
  }
}
