import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, after } from 'next/server';
import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { createOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createInventoryService } from '@/services/inventory.service';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { getTranslations } from 'next-intl/server';
import { verifyOrigin } from '@/lib/csrf';
import { determineOrderEventKey, sendOrderEmailForKey } from '@/services/trigger-emails.service';

// Fallback translations for API routes where locale may not be resolved
const FALLBACK_ERRORS: Record<string, string> = {
  rateLimited: 'Trop de requetes. Reessayez plus tard.',
  tenantNotIdentified: 'Tenant non identifie',
  invalidRequestBody: 'Corps de requete invalide',
  invalidOrderData: 'Donnees de commande invalides',
  tenantConfigNotFound: 'Configuration du restaurant non trouvee',
  invalidCoupon: 'Coupon invalide',
  orderSuccess: 'Commande envoyee avec succes',
  serverError: 'Erreur serveur',
  connectionError: 'Erreur de connexion',
};

async function getT() {
  try {
    return await getTranslations('errors');
  } catch {
    return (key: string) => FALLBACK_ERRORS[key] || key;
  }
}

export async function POST(request: Request) {
  let t: (key: string) => string;
  try {
    t = await getT();
  } catch (initError) {
    logger.error('Order API: failed to initialize translations', initError);
    t = (key: string) => FALLBACK_ERRORS[key] || key;
  }
  try {
    // 0. CSRF origin check (public POST endpoint)
    const originError = verifyOrigin(request);
    if (originError) return originError;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ error: t('tenantNotIdentified') }, { status: 400 });
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t('invalidRequestBody') }, { status: 400 });
    }

    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json({ error: t('invalidOrderData'), details: errors }, { status: 400 });
    }

    // 3. Execute order creation via service
    // Use admin client for the entire order flow. The orders API is public
    // (anonymous customers), so the server Supabase client (which depends on
    // cookies/session) fails with "fetch failed" in Vercel serverless context.
    // All validation (tenant, items, prices) is done server-side regardless.
    const adminSupabase = createAdminClient();
    const orderService = createOrderService(adminSupabase);

    // validateTenant now returns tenant config in a single DB round-trip (Optimization #2)
    const tenant = await orderService.validateTenant(tenantSlug);
    const tenantId = tenant.id;

    const {
      items,
      notes,
      tableNumber,
      customerName,
      customerPhone,
      service_type,
      room_number,
      delivery_address,
      coupon_code,
      display_currency,
      tip_amount,
      client_request_id,
    } = parseResult.data;

    // Idempotency: if this order was already created (offline replay), return it
    // unchanged BEFORE any side effect (coupon claim, order creation).
    if (client_request_id) {
      const existing = await orderService.findOrderByClientRequestId(tenantId, client_request_id);
      if (existing) {
        return NextResponse.json({
          success: true,
          orderId: existing.orderId,
          orderNumber: existing.orderNumber,
          total: existing.total,
          message: t('orderSuccess'),
          deduplicated: true,
        });
      }
    }

    const { validatedTotal, verifiedPrices, categoryIds, itemCategoryMap } =
      await orderService.validateOrderItems(tenantId, items);

    // 3b. Determine preparation zone + validate coupon in parallel (Optimization #3)
    const couponService = createCouponService(adminSupabase);
    const [zoneResult, couponValidation] = await Promise.all([
      orderService.determinePreparationZone(tenantId, categoryIds),
      coupon_code
        ? couponService.validateCoupon(coupon_code, tenantId, validatedTotal, tenant?.currency)
        : Promise.resolve(null),
    ]);

    const { orderZone: preparationZone, categoryZoneMap } = zoneResult;

    // Build per-item preparation zone map (menu_item_id -> zone)
    const itemPreparationZones = new Map<string, 'kitchen' | 'bar' | 'both'>();
    for (const item of items) {
      const catId = itemCategoryMap.get(item.id);
      const zone = catId ? categoryZoneMap.get(catId) : undefined;
      itemPreparationZones.set(item.id, zone || 'kitchen');
    }

    // 4. Process coupon validation result
    let discountAmount = 0;
    let couponResult: { couponId?: string } | null = null;

    if (coupon_code && couponValidation) {
      if (!couponValidation.valid) {
        return NextResponse.json(
          { error: couponValidation.error || t('invalidCoupon') },
          { status: 400 },
        );
      }
      discountAmount = couponValidation.discountAmount;
      couponResult = { couponId: couponValidation.coupon?.id };
    }

    // 6. Calculate pricing breakdown
    const pricing = calculateOrderTotal(
      validatedTotal,
      {
        tax_rate: tenant?.tax_rate || 0,
        service_charge_rate: tenant?.service_charge_rate || 0,
        enable_tax: tenant?.enable_tax || false,
        enable_service_charge: tenant?.enable_service_charge || false,
      },
      discountAmount,
      tenant?.currency,
    );

    // 7. Atomically claim coupon usage BEFORE order creation to prevent double-spend
    if (couponResult?.couponId) {
      const claimed = await couponService.claimUsage(couponResult.couponId);
      if (!claimed) {
        return NextResponse.json({ error: t('invalidCoupon') }, { status: 400 });
      }
    }

    // 8. Create order with all fields (rollback coupon usage on failure)
    let result;
    try {
      result = await orderService.createOrderWithItems({
        tenantId,
        items,
        total: pricing.total,
        tableNumber,
        customerName,
        customerPhone,
        notes,
        service_type,
        room_number,
        delivery_address,
        subtotal: pricing.subtotal,
        tax_amount: pricing.taxAmount,
        service_charge_amount: pricing.serviceChargeAmount,
        discount_amount: pricing.discountAmount,
        tip_amount: tip_amount ?? 0,
        coupon_id: couponResult?.couponId,
        display_currency,
        verifiedPrices,
        preparation_zone: preparationZone,
        itemPreparationZones,
        clientRequestId: client_request_id,
      });
    } catch (orderError) {
      // Rollback coupon usage if order creation fails
      if (couponResult?.couponId) {
        try {
          await couponService.unclaimUsage(couponResult.couponId);
        } catch (unclaimError) {
          logger.error('CRITICAL: Failed to unclaim coupon after order failure', unclaimError, {
            couponId: couponResult.couponId,
          });
        }
      }
      throw orderError;
    }

    // Concurrent replay deduped at the DB unique index: the winning request
    // already created this order and ran every side effect. Undo the coupon
    // claim we made above (the deduped result is a success, so the catch that
    // unclaims never fired) and skip notifications/destock/quota.
    if (result.deduplicated) {
      if (couponResult?.couponId) {
        try {
          await couponService.unclaimUsage(couponResult.couponId);
        } catch (unclaimError) {
          logger.error('Failed to unclaim coupon after dedup', unclaimError, {
            couponId: couponResult.couponId,
          });
        }
      }
      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: result.total,
        message: t('orderSuccess'),
        deduplicated: true,
      });
    }

    // 8b. Record an auditable coupon redemption (audit H11). The counter was
    // already claimed before insert; this appends the who/which/how-much record.
    // Only for a freshly-created (non-deduplicated) order with a coupon.
    const redeemedCouponId = couponResult?.couponId;
    if (redeemedCouponId) {
      const redeemedOrderId = result.orderId;
      after(() =>
        couponService.recordRedemption({
          tenantId,
          couponId: redeemedCouponId,
          orderId: redeemedOrderId,
          discountAmount: pricing.discountAmount,
        }),
      );
    }

    // 9. Create in-app notification for admins (scheduled via after() so Vercel
    // serverless runs it after the response instead of racing a fire-and-forget promise).
    after(async () => {
      const { error: notifError } = await adminSupabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: null, // broadcast to all tenant admins
        type: 'info',
        title: `Nouvelle commande - Table ${tableNumber}`,
        body: `${items.length} article${items.length > 1 ? 's' : ''} - ${pricing.total.toLocaleString('fr-FR')} ${tenant.currency || 'XAF'}`,
        link: `/orders`,
      });
      if (notifError) {
        logger.error('Failed to create order notification', notifError, {
          tenantId,
          orderId: result.orderId,
        });
      }
    });

    // 10. Behavioral email triggers (scheduled via after() so Vercel serverless
    // guarantees the work runs after the response is sent, instead of racing
    // a fire-and-forget promise that the platform may freeze/terminate).
    after(async () => {
      try {
        const [countResult, ownerResult, tenantExtResult] = await Promise.all([
          adminSupabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
          adminSupabase
            .from('admin_users')
            .select('email')
            .eq('tenant_id', tenantId)
            .eq('role', 'owner')
            .maybeSingle(),
          adminSupabase
            .from('tenants')
            .select('name, activation_events')
            .eq('id', tenantId)
            .single(),
        ]);

        const ordersCount = countResult.count ?? 0;
        const adminEmail = ownerResult.data?.email;
        if (!adminEmail) return;

        const restaurantName = (tenantExtResult.data?.name as string | undefined) ?? tenantSlug;
        const activationEvents =
          (tenantExtResult.data?.activation_events as Record<string, string> | undefined) ?? {};
        const dashboardUrl = `https://${tenantSlug}.attabl.com/admin`;

        const eventKey = determineOrderEventKey({ ordersCount, activationEvents });
        if (eventKey) {
          // Atomically claim the event slot server-side - merges into the live row
          // (no stale snapshot), so a concurrent writer's key is never clobbered.
          const { data: claimed } = await adminSupabase.rpc('claim_activation_event', {
            p_tenant_id: tenantId,
            p_event_key: eventKey,
          });
          if (claimed) {
            await sendOrderEmailForKey(eventKey, { adminEmail, restaurantName, dashboardUrl });
          }
        }
      } catch (triggerErr) {
        logger.warn('Order trigger email check failed (non-blocking)', { err: triggerErr });
      }
    });

    // 11. Auto-destock inventory (non-blocking - order succeeds even if destock fails)
    const hasInventory = canAccessFeature(
      'canAccessInventory',
      tenant?.subscription_plan as SubscriptionPlan | null,
      tenant?.subscription_status as SubscriptionStatus | null,
      tenant?.trial_ends_at as string | null,
    );
    if (hasInventory) {
      // Scheduled via after() so destock + low-stock check survive serverless
      // freeze after the response (was a raced fire-and-forget chain).
      after(async () => {
        try {
          const inventoryService = createInventoryService(adminSupabase);
          await inventoryService.destockOrder(result.orderId, tenantId);
          const { checkAndNotifyLowStock } = await import('@/services/notification.service');
          await checkAndNotifyLowStock(tenantId);
        } catch (err) {
          logger.error('Auto-destock failed (non-blocking)', err);
          Sentry.captureException(err, {
            tags: { area: 'inventory-destock' },
            extra: { orderId: result.orderId, tenantId },
          });
        }
      });
    }

    // 12. Monthly order quota check (NON-blocking - never rejects an order).
    // Scheduled via after() so it survives serverless freeze, like the blocks above.
    // Warns admins once per month when the plan's monthly order quota is exceeded.
    after(async () => {
      try {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const enforcement = createPlanEnforcementService(adminSupabase);
        const usage = await enforcement.getMonthlyOrderUsage(tenant, monthStart);
        if (!usage.exceeded) return;

        const monthKey = `monthly_quota_exceeded_${now.getUTCFullYear()}_${now.getUTCMonth() + 1}`;
        // Atomically claim the monthly slot server-side - merges into the live row,
        // so a concurrent writer's key is never clobbered. Notify once per month.
        const { data: claimed } = await adminSupabase.rpc('claim_activation_event', {
          p_tenant_id: tenantId,
          p_event_key: monthKey,
        });
        if (claimed) {
          await adminSupabase.from('notifications').insert({
            tenant_id: tenantId,
            user_id: null,
            type: 'warning',
            title: 'Quota de commandes mensuel atteint',
            body: `Votre plan inclut ${usage.limit} commandes par mois. Passez au plan superieur pour lever cette limite.`,
            link: `/admin/subscription`,
          });
        }
      } catch (quotaErr) {
        logger.warn('Monthly quota check failed (non-blocking)', { err: quotaErr });
      }
    });

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      message: t('orderSuccess'),
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Order ServiceError details', { code: error.code, details: error.details });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    // Log the error object (Sentry captures the full stack automatically).
    // Do NOT log raw stack traces as structured JSON fields - they leak file
    // paths and internal structure in log aggregators.
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Order creation error', error, { message: errMsg });
    return NextResponse.json({ error: t('serverError') }, { status: 500 });
  }
}
