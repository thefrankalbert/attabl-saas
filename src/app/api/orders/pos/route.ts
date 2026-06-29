import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, after } from 'next/server';
import { logger } from '@/lib/logger';
import { createPOSOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createInventoryService } from '@/services/inventory.service';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { fetchMenuItemsByIds } from '@/lib/menu-items-query';
import { canAccessFeature } from '@/lib/plans/features';
import type { Tenant } from '@/types/admin.types';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

/**
 * Applies POS status/payment fields to an order. Idempotent: the payment flip is
 * scoped to payment_status='pending', so re-running it on a replay (or an order
 * already paid) is a no-op and never re-stamps paid_at. This lets a replayed POS
 * order HEAL an earlier non-fatal update failure instead of staying stuck unpaid.
 * Non-fatal on error (the order itself already exists).
 */
async function applyPosFinalState(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  tenantId: string,
  status: string,
  paymentMethod: string | undefined,
): Promise<void> {
  if (paymentMethod) {
    const { data, error } = await supabase
      .from('orders')
      .update({
        payment_method: paymentMethod,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        ...(status !== 'pending' ? { status } : {}),
      })
      .eq('id', orderId)
      // Belt filter: service-role client bypasses RLS, so scope to the tenant.
      .eq('tenant_id', tenantId)
      // Idempotent guard: only flip an unpaid order, never re-stamp a paid one.
      .eq('payment_status', 'pending')
      .select('id, total, tip_amount, session_id');
    if (error) {
      logger.error('POS order: failed to apply payment/status', error, { orderId });
      return;
    }
    // Append the tender to the ledger (audit H2/H8), only when this call actually
    // flipped the order to paid - keeps the ledger idempotent (no duplicate tender
    // on replay). amount = total (excl. tip) + tip.
    const flipped = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (flipped) {
      const amount = Number(flipped.total || 0) + Number(flipped.tip_amount || 0);
      const { error: tenderError } = await supabase.from('payments').insert({
        tenant_id: tenantId,
        order_id: orderId,
        amount,
        method: paymentMethod,
        status: 'completed',
      });
      if (tenderError) {
        logger.error('POS order: failed to record payment tender', tenderError, { orderId });
      }
      // Close the table session once fully settled (audit C1) - the POS create+pay
      // path does not go through markPaid, so it must close the session here too,
      // otherwise sessions stay open forever and tomorrow's orders attach to today's.
      const sessionId = (flipped as { session_id?: string | null }).session_id;
      if (sessionId) {
        await createOrderService(supabase).closeSessionIfFullySettled(sessionId, tenantId);
      }
    }
    return;
  }
  if (status !== 'pending') {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);
    if (error) {
      logger.error('POS order: failed to apply status', error, { orderId });
    }
  }
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

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
      client_request_id,
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

    // Idempotency: if this POS order was already created (offline replay), return
    // it BEFORE any non-idempotent side effect (coupon claim, order creation,
    // destock). Still (re-)apply the status/payment flip idempotently so a replay
    // heals an order whose original non-fatal payment update had failed.
    if (client_request_id) {
      const existing = await orderService.findOrderByClientRequestId(tenant_id, client_request_id);
      if (existing) {
        await applyPosFinalState(
          adminSupabase,
          existing.orderId,
          tenant_id,
          status,
          payment_method,
        );
        return NextResponse.json({
          success: true,
          orderId: existing.orderId,
          orderNumber: existing.orderNumber,
          total: existing.total,
          deduplicated: true,
        });
      }
    }

    // 5. Fetch menu items AND tenant config in PARALLEL (independent queries)
    const itemIds = items.map((item) => item.menu_item_id);
    const [menuResult, tenantResult] = await Promise.all([
      fetchMenuItemsByIds(
        adminSupabase,
        tenant_id,
        itemIds,
        'id, name, name_en, price, is_available, category_id, item_price_variants(variant_name_fr, price)',
      ),
      adminSupabase
        .from('tenants')
        .select(
          'currency, tax_rate, service_charge_rate, enable_tax, enable_service_charge, subscription_plan, subscription_status, trial_ends_at',
        )
        .eq('id', tenant_id)
        .is('deleted_at', null)
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

    type PosMenuRow = {
      id: string;
      name: string;
      name_en: string | null;
      price: number;
      is_available: boolean;
      category_id: string | null;
      item_price_variants?: { variant_name_fr: string; price: number }[];
    };

    const menuItemsMap = new Map(
      (menuItems || []).map((mi) => {
        const row = mi as unknown as PosMenuRow;
        return [row.id, row] as const;
      }),
    );

    // Check all items exist and are available
    const missingItems: string[] = [];
    for (const item of items) {
      const mi = menuItemsMap.get(item.menu_item_id);
      if (!mi) {
        missingItems.push(item.menu_item_id);
      } else if (mi.is_available === false) {
        missingItems.push(String(mi.name ?? item.menu_item_id));
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
      let price = Number(mi.price) || 0;

      if (item.selected_variant && mi.item_price_variants) {
        const variants = mi.item_price_variants as { variant_name_fr: string; price: number }[];
        const variant = variants.find((v) => v.variant_name_fr === item.selected_variant);
        if (variant) {
          price = variant.price;
        }
      }

      return {
        id: String(mi.id),
        name: String(mi.name),
        name_en: (mi.name_en as string | null) || undefined,
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
        ...new Set(
          (menuItems || [])
            .map((mi) => mi.category_id as string | null | undefined)
            .filter((id): id is string => Boolean(id)),
        ),
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
    const tipValue = tip_amount && tip_amount > 0 ? tip_amount : 0;

    let result;
    try {
      result = await orderService.createOrderWithItems({
        tenantId: tenant_id,
        items: serviceItems,
        // orders.total is stored EXCLUDING tip (tip lives in tip_amount), matching the
        // storefront route (api/orders/route.ts). Revenue aggregates do SUM(total +
        // tip_amount); storing total+tip here too double-counted POS tips. Keeping a
        // single consistent semantic is what makes the channels reconcile.
        total: pricing.total,
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
        clientRequestId: client_request_id,
      });
    } catch (orderError) {
      // Rollback coupon usage if order creation fails
      if (couponResult?.couponId) {
        await couponService.unclaimUsage(couponResult.couponId);
      }
      throw orderError;
    }

    // Concurrent replay deduped at the DB unique index: the winning request
    // already created this order and destocked. Undo the coupon claim we made
    // above (the deduped result is a success, so the catch never unclaimed),
    // heal the payment/status idempotently, and skip destock/notif/quota.
    if (result.deduplicated) {
      if (couponResult?.couponId) {
        try {
          await couponService.unclaimUsage(couponResult.couponId);
        } catch (unclaimError) {
          logger.error('POS order: failed to unclaim coupon after dedup', unclaimError, {
            couponId: couponResult.couponId,
          });
        }
      }
      await applyPosFinalState(adminSupabase, result.orderId, tenant_id, status, payment_method);
      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: result.total,
        deduplicated: true,
      });
    }

    // 10. Apply POS-specific status/payment fields (idempotent). The service
    // always creates with status='pending'; POS may need 'delivered' + payment.
    await applyPosFinalState(adminSupabase, result.orderId, tenant_id, status, payment_method);

    // 10b. Record an auditable coupon redemption (audit H11), best-effort.
    const redeemedCouponId = couponResult?.couponId;
    if (redeemedCouponId) {
      const redeemedOrderId = result.orderId;
      void couponService.recordRedemption({
        tenantId: tenant_id,
        couponId: redeemedCouponId,
        orderId: redeemedOrderId,
        discountAmount,
      });
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

    // 13. Monthly order quota check (NON-blocking - never rejects an order).
    // Scheduled via after() so it survives serverless freeze.
    after(async () => {
      try {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const enforcement = createPlanEnforcementService(adminSupabase);
        const usage = await enforcement.getMonthlyOrderUsage(
          { ...tenant, id: tenant_id } as Tenant,
          monthStart,
        );
        if (!usage.exceeded) return;

        const monthKey = `monthly_quota_exceeded_${now.getUTCFullYear()}_${now.getUTCMonth() + 1}`;
        // Atomically claim the monthly slot server-side - merges into the live row,
        // so a concurrent writer's key is never clobbered. Notify once per month.
        const { data: claimed } = await adminSupabase.rpc('claim_activation_event', {
          p_tenant_id: tenant_id,
          p_event_key: monthKey,
        });
        if (claimed) {
          await adminSupabase.from('notifications').insert({
            tenant_id,
            user_id: null,
            type: 'warning',
            title: 'Quota de commandes mensuel atteint',
            body: `Votre plan inclut ${usage.limit} commandes par mois. Passez au plan superieur pour lever cette limite.`,
            link: `/admin/subscription`,
          });
        }
      } catch (quotaErr) {
        logger.warn('POS order: monthly quota check failed (non-blocking)', { err: quotaErr });
      }
    });

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
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
