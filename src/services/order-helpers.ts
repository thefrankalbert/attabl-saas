/**
 * Shared helpers for order routes (QR + POS)
 *
 * Extracts duplicated logic for:
 * - Tenant config fetch + pricing calculation
 * - In-app notification creation
 * - Fire-and-forget inventory destock + stock alerts
 * - ServiceError catch block formatting
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { canAccessFeature } from '@/lib/plans/features';
import { createInventoryService } from '@/services/inventory.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { NextResponse } from 'next/server';
import type { PricingBreakdown } from '@/types/admin.types';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface TenantConfig {
  currency: string | null;
  tax_rate: number | null;
  service_charge_rate: number | null;
  enable_tax: boolean | null;
  enable_service_charge: boolean | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
}

export interface TenantPricingResult {
  tenant: TenantConfig;
  pricing: PricingBreakdown;
}

export interface OrderNotificationParams {
  tenantId: string;
  orderId: string;
  tableNumber: string;
  itemCount: number;
  total: number;
  currency: string;
  source: 'pos' | 'qr';
}

export interface PostOrderInventoryParams {
  orderId: string;
  tenantId: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
}

// ----------------------------------------------------------------
// 1. Fetch tenant config and calculate pricing
// ----------------------------------------------------------------

/**
 * Fetch tenant tax/service-charge config and compute the pricing breakdown.
 *
 * Returns null when the tenant row is not found so callers can return
 * their own 404 response (QR route needs translated messages).
 */
export async function fetchTenantPricing(
  adminSupabase: SupabaseClient,
  tenantId: string,
  verifiedTotal: number,
  discountAmount: number = 0,
): Promise<TenantPricingResult | null> {
  const { data: tenant, error: tenantError } = await adminSupabase
    .from('tenants')
    .select(
      'currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
    )
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) {
    return null;
  }

  const pricing = calculateOrderTotal(
    verifiedTotal,
    {
      tax_rate: tenant.tax_rate || 0,
      service_charge_rate: tenant.service_charge_rate || 0,
      enable_tax: tenant.enable_tax || false,
      enable_service_charge: tenant.enable_service_charge || false,
    },
    discountAmount,
  );

  return { tenant: tenant as TenantConfig, pricing };
}

// ----------------------------------------------------------------
// 2. Create order notification
// ----------------------------------------------------------------

/**
 * Insert an in-app notification for tenant admins about a new order.
 * Logs on failure but never throws -- notifications are non-critical.
 */
export async function createOrderNotification(
  adminSupabase: SupabaseClient,
  params: OrderNotificationParams,
): Promise<void> {
  const label = params.source === 'pos' ? 'POS' : '';
  const titlePrefix = label ? `Nouvelle commande ${label}` : 'Nouvelle commande';

  const { error: notifError } = await adminSupabase.from('notifications').insert({
    tenant_id: params.tenantId,
    user_id: null, // broadcast to all tenant admins
    type: 'info',
    title: `${titlePrefix} - Table ${params.tableNumber}`,
    body: `${params.itemCount} article${params.itemCount > 1 ? 's' : ''} - ${params.total.toLocaleString('fr-FR')} ${params.currency}`,
    link: '/orders',
  });

  if (notifError) {
    logger.error('Failed to create order notification', notifError, {
      tenantId: params.tenantId,
      orderId: params.orderId,
      source: params.source,
    });
  }
}

// ----------------------------------------------------------------
// 3. Fire-and-forget inventory destock + stock alerts
// ----------------------------------------------------------------

/**
 * If the tenant plan includes inventory access, destock items for the
 * given order and then check stock alert thresholds.
 *
 * Runs entirely in the background -- never blocks the HTTP response
 * and never throws.
 */
export function triggerPostOrderInventory(
  adminSupabase: SupabaseClient,
  params: PostOrderInventoryParams,
): void {
  const hasInventory = canAccessFeature(
    'canAccessInventory',
    params.subscriptionPlan as SubscriptionPlan | null,
    params.subscriptionStatus as SubscriptionStatus | null,
    params.trialEndsAt,
  );

  if (!hasInventory) return;

  const inventoryService = createInventoryService(adminSupabase);
  inventoryService
    .destockOrder(params.orderId, params.tenantId)
    .then(() => {
      // Stock alerts use the same feature gate -- already checked above
      import('@/services/notification.service').then(({ checkAndNotifyLowStock }) =>
        checkAndNotifyLowStock(params.tenantId).catch((err) => {
          logger.error('Stock alert check failed (non-blocking)', err);
        }),
      );
    })
    .catch((err) => {
      logger.error('Auto-destock failed (non-blocking)', err);
    });
}

// ----------------------------------------------------------------
// 4. Format ServiceError catch block into NextResponse
// ----------------------------------------------------------------

/**
 * Convert a caught error into an appropriate NextResponse.
 *
 * @param error    - The caught value from a try/catch
 * @param label    - A short prefix for log messages (e.g. "POS order" or "Order")
 * @param fallback - The user-facing message for unexpected errors (allows i18n)
 */
export function handleOrderError(
  error: unknown,
  label: string,
  fallback: string = 'Erreur serveur',
): NextResponse {
  if (error instanceof ServiceError) {
    if (error.details) {
      logger.error(`${label} ServiceError details`, {
        code: error.code,
        details: error.details,
      });
    }
    return NextResponse.json(
      { error: error.message },
      { status: serviceErrorToStatus(error.code) },
    );
  }

  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack =
    error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined;
  logger.error(`${label} creation error`, error, { message: errMsg, stack: errStack });
  return NextResponse.json({ error: fallback }, { status: 500 });
}
