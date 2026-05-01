import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { createOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createInventoryService } from '@/services/inventory.service';
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
    } = parseResult.data;

    const { validatedTotal, verifiedPrices, categoryIds, itemCategoryMap } =
      await orderService.validateOrderItems(tenantId, items);

    // 3b. Determine preparation zone + validate coupon in parallel (Optimization #3)
    const couponService = createCouponService(adminSupabase);
    const [zoneResult, couponValidation] = await Promise.all([
      orderService.determinePreparationZone(tenantId, categoryIds),
      coupon_code
        ? couponService.validateCoupon(coupon_code, tenantId, validatedTotal)
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

    // 9. Create in-app notification for admins (fire-and-forget, non-blocking)
    void Promise.resolve(
      adminSupabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: null, // broadcast to all tenant admins
        type: 'info',
        title: `Nouvelle commande - Table ${tableNumber}`,
        body: `${items.length} article${items.length > 1 ? 's' : ''} - ${pricing.total.toLocaleString('fr-FR')} ${tenant.currency || 'XAF'}`,
        link: `/orders`,
      }),
    ).then(({ error: notifError }) => {
      if (notifError) {
        logger.error('Failed to create order notification', notifError, {
          tenantId,
          orderId: result.orderId,
        });
      }
    });

    // 10. Behavioral email triggers (fire-and-forget)
    void (async () => {
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
          const now = new Date().toISOString();
          // Atomically claim the event slot - only update if key doesn't exist yet
          const { data: claimed } = await adminSupabase
            .from('tenants')
            .update({ activation_events: { ...activationEvents, [eventKey]: now } })
            .eq('id', tenantId)
            .filter(`activation_events->>${eventKey}`, 'is', null)
            .select('id');
          if (claimed?.length) {
            await sendOrderEmailForKey(eventKey, { adminEmail, restaurantName, dashboardUrl });
          }
        }
      } catch (triggerErr) {
        logger.warn('Order trigger email check failed (non-blocking)', { err: triggerErr });
      }
    })();

    // 11. Auto-destock inventory (non-blocking - order succeeds even if destock fails)
    const hasInventory = canAccessFeature(
      'canAccessInventory',
      tenant?.subscription_plan as SubscriptionPlan | null,
      tenant?.subscription_status as SubscriptionStatus | null,
      tenant?.trial_ends_at as string | null,
    );
    if (hasInventory) {
      const inventoryService = createInventoryService(adminSupabase);
      inventoryService
        .destockOrder(result.orderId, tenantId)
        .then(() => {
          import('@/services/notification.service').then(({ checkAndNotifyLowStock }) =>
            checkAndNotifyLowStock(tenantId).catch((err) => {
              logger.error('Stock alert check failed (non-blocking)', err);
            }),
          );
        })
        .catch((err) => {
          logger.error('Auto-destock failed (non-blocking)', err);
        });
    }

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
