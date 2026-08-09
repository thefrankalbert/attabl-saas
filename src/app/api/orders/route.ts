import { createAdminClient } from '@/lib/supabase/admin';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { NextResponse, after } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { createOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, untrustedOrderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { canAccessFeature, getPlanLimits } from '@/lib/plans/features';
import { assertOrderFeaturesAllowed } from '@/services/plan-enforcement.service';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { verifyOrigin } from '@/lib/csrf';
import {
  FALLBACK_ERRORS,
  getT,
  scheduleOrderNotification,
  scheduleTriggerEmails,
  scheduleDestock,
  scheduleMonthlyQuotaCheck,
} from './route.helpers';

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

    const headersList = await headers();
    const { slug: tenantSlug, trusted } = readTenantSlug(headersList);

    if (!tenantSlug) {
      return NextResponse.json({ error: t('tenantNotIdentified') }, { status: 400 });
    }

    // 1. ORDER-SPAM. Le compartiment est desormais indexe par (IP, tenant) et
    // non par IP seule. Deux consequences, toutes deux voulues:
    //  - un attaquant ne peut plus vider le budget d'un code promo d'un tenant
    //    donne en noyant l'endpoint depuis une seule adresse;
    //  - un restaurant en coup de feu ne consomme plus le quota des autres, la
    //    limite globale par IP etant partagee entre TOUS les tenants.
    const ip = getClientIp(request);
    const identifier = `${ip}:${tenantSlug}`;
    const { success: allowed } = await orderLimiter.check(identifier);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // Quand le tenant ne vient PAS d'une source serveur (sous-domaine, domaine
    // custom, chemin /sites/), il ne peut venir que du `Referer` - forgeable.
    // C'est le seul chemin qu'emprunte l'attaque, et aucun convive normal n'y
    // passe. On le borne donc beaucoup plus serre, en plus de la limite ci-dessus.
    if (!trusted) {
      const { success: untrustedAllowed } = await untrustedOrderLimiter.check(identifier);
      if (!untrustedAllowed) {
        logger.warn('ORDER-SPAM: rafale de commandes sans tenant de confiance', {
          tenantSlug,
        });
        return NextResponse.json(
          { error: t('rateLimited') },
          { status: 429, headers: { 'Retry-After': '3600' } },
        );
      }
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

    // Plan gate: reject paid service modes (delivery/room service), tips, and a
    // secondary display currency the tenant's plan does not include. A crafted
    // storefront POST could otherwise set service_type=delivery on a Starter plan.
    // Throws ServiceError('UNAUTHORIZED') -> mapped to 403 by the catch below.
    assertOrderFeaturesAllowed(
      getPlanLimits(
        tenant.subscription_plan as SubscriptionPlan | null,
        tenant.subscription_status as SubscriptionStatus | null,
        tenant.trial_ends_at as string | null,
      ),
      { service_type, tip_amount, display_currency },
      tenant.currency || 'XAF',
    );

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
        // F2: la devise de COMPTABILISATION est celle du tenant, jamais la
        // preference d'affichage du client (stockee en localStorage et envoyee
        // dans le corps). Le montant est calcule plus haut avec `tenant.currency`
        // par calculateOrderTotal; le passer ensuite en EUR faisait convertir
        // 5 000 XAF en 500 000 unites mineures, relues 5 000,00 EUR a
        // l'encaissement - soit environ 3,3 millions XAF pour une addition de
        // 5 000. `display_currency` du corps reste valide par le plan juste
        // au-dessus (assertOrderFeaturesAllowed), il ne sert plus qu'a cela.
        display_currency: tenant?.currency ?? 'XAF',
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

    // 9. Create in-app notification for admins.
    scheduleOrderNotification(adminSupabase, {
      tenantId,
      tableNumber,
      itemsCount: items.length,
      total: pricing.total,
      currency: tenant.currency,
      orderId: result.orderId,
    });

    // 10. Behavioral email triggers.
    scheduleTriggerEmails(adminSupabase, { tenantId, tenantSlug });

    // 11. Auto-destock inventory (non-blocking - order succeeds even if destock fails)
    const hasInventory = canAccessFeature(
      'canAccessInventory',
      tenant?.subscription_plan as SubscriptionPlan | null,
      tenant?.subscription_status as SubscriptionStatus | null,
      tenant?.trial_ends_at as string | null,
    );
    if (hasInventory) {
      scheduleDestock(adminSupabase, { orderId: result.orderId, tenantId });
    }

    // 12. Monthly order quota check (NON-blocking - never rejects an order).
    scheduleMonthlyQuotaCheck(adminSupabase, { tenant, tenantId });

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
