import { createClient } from '@/lib/supabase/server';
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

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { error: 'Données de commande invalides', details: errors },
        { status: 400 },
      );
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
    } = parseResult.data;

    const { validatedTotal } = await orderService.validateOrderItems(tenantId, items);

    // 4. Validate coupon if provided
    let discountAmount = 0;
    let couponResult: { couponId?: string } | null = null;
    const couponService = createCouponService(supabase);

    if (coupon_code) {
      const validation = await couponService.validateCoupon(coupon_code, tenantId, validatedTotal);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Code promo invalide' },
          { status: 400 },
        );
      }
      discountAmount = validation.discountAmount;
      couponResult = { couponId: validation.coupon?.id };
    }

    // 5. Fetch tenant config for tax & service charge
    const { data: tenant } = await supabase
      .from('tenants')
      .select(
        'currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
      )
      .eq('id', tenantId)
      .single();

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

    // 7. Create order with all fields
    const result = await orderService.createOrderWithItems({
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
    });

    // 8. Increment coupon usage after successful order
    if (couponResult?.couponId) {
      await couponService.incrementUsage(couponResult.couponId);
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
      message: 'Commande enregistrée avec succès !',
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Order creation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
