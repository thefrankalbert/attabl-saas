import { createClient } from '@/lib/supabase/server';
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

export async function POST(request: Request) {
  const t = await getTranslations('errors');
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
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
    const orderService = createOrderService(supabase);

    const { id: tenantId } = await orderService.validateTenant(tenantSlug);

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
    } = parseResult.data;

    const { validatedTotal, verifiedPrices } = await orderService.validateOrderItems(
      tenantId,
      items,
    );

    // 4. Validate coupon if provided
    let discountAmount = 0;
    let couponResult: { couponId?: string } | null = null;
    const couponService = createCouponService(supabase);

    if (coupon_code) {
      const validation = await couponService.validateCoupon(coupon_code, tenantId, validatedTotal);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || t('invalidCoupon') },
          { status: 400 },
        );
      }
      discountAmount = validation.discountAmount;
      couponResult = { couponId: validation.coupon?.id };
    }

    // 5. Fetch tenant config for tax & service charge (use admin client to bypass RLS)
    const adminSupabase = createAdminClient();
    const { data: tenant, error: tenantError } = await adminSupabase
      .from('tenants')
      .select(
        'currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: t('tenantConfigNotFound') }, { status: 404 });
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
        coupon_id: couponResult?.couponId,
        display_currency,
        verifiedPrices,
      });
    } catch (orderError) {
      // Rollback coupon usage if order creation fails
      if (couponResult?.couponId) {
        await couponService.unclaimUsage(couponResult.couponId);
      }
      throw orderError;
    }

    // 9. Auto-destock inventory (non-blocking — order succeeds even if destock fails)
    const hasInventory = canAccessFeature(
      'inventoryTracking',
      tenant?.subscription_plan as SubscriptionPlan | null,
      tenant?.subscription_status as SubscriptionStatus | null,
      tenant?.trial_ends_at as string | null,
    );
    if (hasInventory) {
      const inventoryService = createInventoryService(supabase);
      inventoryService
        .destockOrder(result.orderId, tenantId)
        .then(() => {
          // 10. Check stock alerts after destock (non-blocking)
          const hasAlerts = canAccessFeature(
            'stockAlerts',
            tenant?.subscription_plan as SubscriptionPlan | null,
            tenant?.subscription_status as SubscriptionStatus | null,
            tenant?.trial_ends_at as string | null,
          );
          if (hasAlerts) {
            import('@/services/notification.service').then(({ checkAndNotifyLowStock }) =>
              checkAndNotifyLowStock(tenantId).catch((err) => {
                logger.error('Stock alert check failed (non-blocking)', err);
              }),
            );
          }
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
    logger.error('Order creation error', error);
    return NextResponse.json({ error: t('serverError') }, { status: 500 });
  }
}
