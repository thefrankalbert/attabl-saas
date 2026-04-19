import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createPOSOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createInventoryService } from '@/services/inventory.service';
import { canAccessFeature } from '@/lib/plans/features';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Authenticate user + derive tenant from session (IDOR prevention)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- role kept in destructure to force auth assertion; POS endpoint doesn't gate by role yet
    const { tenantId: tenant_id, user, role } = await getAuthenticatedUserWithTenant();

    // 3. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = createPOSOrderSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { error: 'Donnees de commande invalides', details: errors },
        { status: 400 },
      );
    }

    const {
      table_number,
      status,
      service_type,
      room_number,
      delivery_address,
      payment_method,
      tip_amount,
      notes,
      coupon_code,
      items,
    } = parseResult.data;

    // 4. Get admin user record for server_id
    const adminSupabase = createAdminClient();

    const { data: adminUser } = await adminSupabase
      .from('admin_users')
      .select('id, tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // 5. Validate items and verify prices server-side
    const orderService = createOrderService(adminSupabase);

    // 5. Fetch menu items AND tenant config in PARALLEL (independent queries)
    const itemIds = items.map((item) => item.menu_item_id);
    const [menuResult, tenantResult] = await Promise.all([
      adminSupabase
        .from('menu_items')
        .select(
          'id, name, name_en, price, is_available, category_id, item_price_variants(variant_name_fr, price)',
        )
        .eq('tenant_id', tenant_id)
        .in('id', itemIds),
      adminSupabase
        .from('tenants')
        .select(
          'currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
        )
        .eq('id', tenant_id)
        .single(),
    ]);

    const { data: menuItems, error: menuError } = menuResult;
    if (menuError) {
      logger.error('POS order: error fetching menu items', menuError);
      throw new ServiceError('Erreur lors de la verification du menu', 'INTERNAL', menuError);
    }

    const { data: tenant, error: tenantError } = tenantResult;
    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Configuration du restaurant non trouvee' },
        { status: 404 },
      );
    }

    const menuItemsMap = new Map(menuItems?.map((mi) => [mi.id, mi]) || []);

    // Check all items exist and are available
    const missingItems: string[] = [];
    for (const item of items) {
      const mi = menuItemsMap.get(item.menu_item_id);
      if (!mi) {
        missingItems.push(item.menu_item_id);
      } else if (mi.is_available === false) {
        missingItems.push(mi.name);
      }
    }
    if (missingItems.length > 0) {
      return NextResponse.json(
        { error: 'Certains articles ne sont plus disponibles', details: missingItems },
        { status: 400 },
      );
    }

    // Build the service-compatible item array, resolving variant prices
    const serviceItems = items.map((item) => {
      const mi = menuItemsMap.get(item.menu_item_id)!;
      let price = mi.price;

      if (item.selected_variant && mi.item_price_variants) {
        const variants = mi.item_price_variants as { variant_name_fr: string; price: number }[];
        const variant = variants.find((v) => v.variant_name_fr === item.selected_variant);
        if (variant) {
          price = variant.price;
        }
      }

      return {
        id: mi.id,
        name: mi.name,
        name_en: mi.name_en || undefined,
        price,
        quantity: item.quantity,
        modifiers: item.modifiers || undefined,
        customerNotes: item.customer_notes || undefined,
        selectedVariant: item.selected_variant
          ? { name_fr: item.selected_variant, price }
          : undefined,
      };
    });

    // 6. Validate items + determine preparation zones in PARALLEL
    const [validationResult, zoneResult] = await Promise.all([
      orderService.validateOrderItems(tenant_id, serviceItems),
      orderService.determinePreparationZone(tenant_id, [
        ...new Set(menuItems?.map((mi) => mi.category_id).filter(Boolean) || []),
      ]),
    ]);

    const { validatedTotal, verifiedPrices, itemCategoryMap } = validationResult;
    const { orderZone: preparationZone, categoryZoneMap } = zoneResult;

    // Build per-item preparation zone map
    const itemPreparationZones = new Map<string, 'kitchen' | 'bar' | 'both'>();
    for (const item of serviceItems) {
      const catId = itemCategoryMap.get(item.id);
      const zone = catId ? categoryZoneMap.get(catId) : undefined;
      itemPreparationZones.set(item.id, zone || 'kitchen');
    }

    // 8. Validate coupon if provided
    let discountAmount = 0;
    let couponResult: { couponId?: string } | null = null;
    const couponService = createCouponService(adminSupabase);

    if (coupon_code) {
      const validation = await couponService.validateCoupon(coupon_code, tenant_id, validatedTotal);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error || 'Coupon invalide' }, { status: 400 });
      }
      discountAmount = validation.discountAmount;
      couponResult = { couponId: validation.coupon?.id };
    }

    // 9. Calculate pricing breakdown
    const pricing = calculateOrderTotal(
      validatedTotal,
      {
        tax_rate: tenant.tax_rate || 0,
        service_charge_rate: tenant.service_charge_rate || 0,
        enable_tax: tenant.enable_tax || false,
        enable_service_charge: tenant.enable_service_charge || false,
      },
      discountAmount,
    );

    // 10. Atomically claim coupon usage BEFORE order creation
    if (couponResult?.couponId) {
      const claimed = await couponService.claimUsage(couponResult.couponId);
      if (!claimed) {
        return NextResponse.json({ error: 'Coupon invalide ou limite atteinte' }, { status: 400 });
      }
    }

    // 11. Create order with items via service
    const hasPayment = !!payment_method;
    const tipValue = tip_amount && tip_amount > 0 ? tip_amount : 0;

    let result;
    try {
      result = await orderService.createOrderWithItems({
        tenantId: tenant_id,
        items: serviceItems,
        total: pricing.total + tipValue,
        tableNumber: table_number,
        notes,
        service_type,
        room_number,
        delivery_address,
        subtotal: pricing.subtotal,
        tax_amount: pricing.taxAmount,
        service_charge_amount: pricing.serviceChargeAmount,
        discount_amount: pricing.discountAmount,
        tip_amount: tipValue,
        coupon_id: couponResult?.couponId,
        server_id: adminUser.id,
        verifiedPrices,
        preparation_zone: preparationZone,
        itemPreparationZones,
      });
    } catch (orderError) {
      // Rollback coupon usage if order creation fails
      if (couponResult?.couponId) {
        await couponService.unclaimUsage(couponResult.couponId);
      }
      throw orderError;
    }

    // 10. Update order with POS-specific fields (status, payment)
    // The service always creates with status='pending'. For POS we may need 'delivered'
    // and payment fields. Update atomically after creation.
    const updateFields: Record<string, unknown> = {};
    if (status !== 'pending') {
      updateFields.status = status;
    }
    if (hasPayment) {
      updateFields.payment_method = payment_method;
      updateFields.payment_status = 'paid';
      updateFields.paid_at = new Date().toISOString();
    }
    if (Object.keys(updateFields).length > 0) {
      const { error: updateError } = await adminSupabase
        .from('orders')
        .update(updateFields)
        .eq('id', result.orderId);

      if (updateError) {
        logger.error('POS order: failed to update order fields', updateError, {
          orderId: result.orderId,
        });
        // Non-fatal: order was created successfully, just missing payment/status update
      }
    }

    // 11. Create in-app notification (fire-and-forget, non-blocking)
    void Promise.resolve(
      adminSupabase.from('notifications').insert({
        tenant_id,
        user_id: null,
        type: 'info',
        title: `Nouvelle commande POS - Table ${table_number}`,
        body: `${items.length} article${items.length > 1 ? 's' : ''} - ${pricing.total.toLocaleString('fr-FR')} ${tenant.currency || 'XAF'}`,
        link: '/orders',
      }),
    ).then(({ error: notifError }) => {
      if (notifError) {
        logger.error('POS order: failed to create notification', notifError, {
          tenantId: tenant_id,
          orderId: result.orderId,
        });
      }
    });

    // 12. Auto-destock inventory (non-blocking)
    const hasInventory = canAccessFeature(
      'canAccessInventory',
      tenant.subscription_plan as SubscriptionPlan | null,
      tenant.subscription_status as SubscriptionStatus | null,
      tenant.trial_ends_at as string | null,
    );
    if (hasInventory) {
      const inventoryService = createInventoryService(adminSupabase);
      inventoryService
        .destockOrder(result.orderId, tenant_id)
        .then(() => {
          import('@/services/notification.service').then(({ checkAndNotifyLowStock }) =>
            checkAndNotifyLowStock(tenant_id).catch((err) => {
              logger.error('POS order: stock alert check failed (non-blocking)', err);
            }),
          );
        })
        .catch((err) => {
          logger.error('POS order: auto-destock failed (non-blocking)', err);
        });
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('POS order ServiceError details', {
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
    logger.error('POS order creation error', error, { message: errMsg });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
