import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createPOSOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createOrderService } from '@/services/order.service';
import { createCouponService } from '@/services/coupon.service';
import { createAssignmentService } from '@/services/assignment.service';
import { calculateOrderTotal } from '@/lib/pricing/tax';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { assertOrderFeaturesAllowed } from '@/services/plan-enforcement.service';
import { fetchMenuItemsByIds } from '@/lib/menu-items-query';
import { scheduleDestock } from '../schedule-destock';
import { applyPosPayment, type PosPaymentOutcome } from './apply-pos-payment';
import { checkDineInTable } from '@/services/order/dine-in-table';
import { canAccessFeature, getPlanLimits } from '@/lib/plans/features';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { resolveAdminPermission } from '@/lib/auth/resolve-admin-permission';
import { TENANT_LOCK_COLUMNS, tenantLockReason } from '@/lib/billing/tenant-lock';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

/**
 * Final answer of the route. A payment that could not be booked answers 503:
 * the till's outbox then keeps the sale and replays it (deduplicated: the
 * order is found and only the payment is retried) instead of dropping it as
 * done while the cash is already in the drawer.
 */
function orderResponse(
  body: { orderId: string; orderNumber: string; total: number; deduplicated?: boolean },
  payment: PosPaymentOutcome | undefined,
) {
  if (payment === 'failed') {
    return NextResponse.json(
      { error: "Le paiement n'a pas pu etre enregistre, nouvel essai automatique", ...body },
      { status: 503 },
    );
  }
  return NextResponse.json({
    success: true,
    ...body,
    ...(payment !== undefined ? { paid: payment === 'paid' } : {}),
  });
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Authenticate user + derive tenant from session (IDOR prevention).
    // 'pos.use' gates by fine-grained permission (role defaults + per-user overrides).
    const { tenantId: tenant_id, user } = await getAuthenticatedUserWithTenant('pos.use');

    // 2. Rate limiting, keyed by the authenticated cashier, not the IP. This
    // route is staff-only (auth above), and keying by IP made restaurants behind
    // the same mobile carrier NAT - and the storefront preview/coupon calls that
    // share this bucket - starve each other: past 20 req/min the till queued its
    // orders as "offline" while online (audit caisse 2026-11-15).
    const { success: allowed } = await orderLimiter.check(`pos:${tenant_id}:${user.id}`);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

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

    // ENCAISSER A LA CAISSE = `orders.pay`, pas seulement `pos.use`.
    //
    // Decision du proprietaire (2026-11-09): le serveur prend les commandes a
    // la caisse mais ne touche pas a l'argent. Cette route cree la commande ET,
    // si un moyen de paiement est fourni, la passe a `paid` et inscrit le tender
    // dans `payments` (applyPosPayment). Avec `pos.use` seul, donner la
    // caisse au serveur lui donnait aussi l'encaissement et les pourboires.
    // Un moyen de paiement ou un pourboire exige donc `orders.pay`; sans lui,
    // la commande part en cuisine impayee et le caissier l'encaisse ensuite.
    // Place AVANT le rejeu hors ligne, qui rappelle aussi applyPosPayment.
    // Un coupon aussi: c'est une remise sur l'addition, et le proprietaire a
    // exclu toute remise pour le serveur. Sans ce droit, le serveur baissait le
    // total avec n'importe quel coupon actif.
    if (payment_method || (tip_amount ?? 0) > 0 || coupon_code) {
      const { allowed } = await resolveAdminPermission(
        adminSupabase,
        user.id,
        tenant_id,
        'orders.pay',
      );
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              "Votre role ne permet pas d'encaisser ni d'appliquer un coupon. Envoyez la commande sans paiement.",
          },
          { status: 403 },
        );
      }
    }

    // COUPURE DU RESTAURANT - avant tout effet de bord, rejeu compris.
    //
    // Cette route n'a longtemps porte AUCUNE coupure. Elle lisait bien
    // `subscription_status` plus bas, mais seulement pour choisir les
    // fonctionnalites du plan: or un restaurant gele retombe sur `starter`,
    // dont `canAccessPOS` vaut `true`. Un restaurant gele, suspendu ou
    // desactive encaissait donc normalement (commande creee, `payment_status`
    // a `paid`, ligne dans `payments`, session de table soldee), alors que le
    // canal convive etait coupe depuis F6/CTR7-1. Le verrou du middleware ne
    // pouvait pas rattraper ca: il ne garde que les PAGES, jamais `/api/*`.
    //
    // LE PLACEMENT EST LA MOITIE DU CORRECTIF: le rejeu hors ligne
    // (`client_request_id`) rappelle `applyPosPayment` AVANT la lecture de
    // configuration ci-dessous. Une coupure posee la-bas laisserait donc une
    // file d'attente hors ligne continuer a encaisser apres le gel. Le verrou
    // doit rester ici, en amont de l'idempotence.
    const { data: lockRow, error: lockError } = await adminSupabase
      .from('tenants')
      .select(TENANT_LOCK_COLUMNS)
      .eq('id', tenant_id)
      .is('deleted_at', null)
      .single();

    if (lockError || !lockRow) {
      return NextResponse.json({ error: 'Restaurant non trouve' }, { status: 404 });
    }

    const lockReason = tenantLockReason(lockRow);
    if (lockReason) {
      logger.warn('POS order refused: tenant access locked', {
        tenantId: tenant_id,
        reason: lockReason,
      });
      return NextResponse.json(
        { error: 'Ce restaurant est temporairement indisponible' },
        { status: 403 },
      );
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
        const payment = payment_method
          ? await applyPosPayment(adminSupabase, existing.orderId, tenant_id, payment_method)
          : undefined;
        return orderResponse(
          {
            orderId: existing.orderId,
            orderNumber: existing.orderNumber,
            total: existing.total,
            deduplicated: true,
          },
          payment,
        );
      }
    }

    // A table sent with the order must exist and be active here: an invented
    // number created an orphan table session and printed a fake table on the
    // kitchen ticket. "Sur place" without a table stays allowed at the till
    // (no table configured, or counter sale); POSClient asks for one when
    // tables exist.
    const tableProblem = await checkDineInTable(
      adminSupabase,
      tenant_id,
      service_type,
      table_number,
    );
    // Not refused: an order queued offline before the table was removed or
    // renamed would otherwise be dropped for good by the outbox (a 400 is
    // final), cash already taken. The unknown table leaves the ticket fields
    // and stays readable in the order note for the staff.
    let ticketTable = table_number;
    let ticketNotes = notes;
    if (tableProblem === 'UNKNOWN_TABLE') {
      logger.warn('POS order: unknown table, sent without it', {
        tenantId: tenant_id,
        tableNumber: table_number,
      });
      ticketTable = undefined;
      ticketNotes = [`Table ${table_number}`, notes].filter(Boolean).join(' - ');
    }

    // 5. Fetch menu items AND tenant config in PARALLEL (independent queries)
    const itemIds = items.map((item) => item.menu_item_id);
    const [menuResult, tenantResult] = await Promise.all([
      fetchMenuItemsByIds(
        adminSupabase,
        tenant_id,
        itemIds,
        'id, name, name_en, price, is_available, category_id, item_price_variants(id, variant_name_fr, price)',
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

    // Plan gate: reject paid service modes (delivery/room service) and tips the
    // tenant's plan does not include. POS orders always use the tenant currency,
    // so display_currency is not part of this check. Throws ServiceError -> 403.
    const planLimits = getPlanLimits(
      tenant.subscription_plan as SubscriptionPlan | null,
      tenant.subscription_status as SubscriptionStatus | null,
      tenant.trial_ends_at,
    );
    assertOrderFeaturesAllowed(planLimits, { service_type, tip_amount }, tenant.currency || 'XAF');

    type PosMenuRow = {
      id: string;
      name: string;
      name_en: string | null;
      price: number;
      is_available: boolean;
      category_id: string | null;
      item_price_variants?: { id: string; variant_name_fr: string; price: number }[];
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
      let resolvedVariantId: string | undefined;

      if ((item.selected_variant_id || item.selected_variant) && mi.item_price_variants) {
        const variants = mi.item_price_variants as {
          id: string;
          variant_name_fr: string;
          price: number;
        }[];
        // Resolve by stable id first (collision/rename-proof), name as fallback (audit H4).
        const variant =
          (item.selected_variant_id && variants.find((v) => v.id === item.selected_variant_id)) ||
          variants.find((v) => v.variant_name_fr === item.selected_variant);
        if (variant) {
          price = variant.price;
          resolvedVariantId = variant.id;
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
          ? { id: resolvedVariantId, name_fr: item.selected_variant, price }
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

    const { validatedTotal, verifiedPrices, verifiedLabels, itemCategoryMap } = validationResult;
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
      const validation = await couponService.validateCoupon(
        coupon_code,
        tenant_id,
        validatedTotal,
        tenant.currency,
      );
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
      tenant.currency,
    );

    // 10. Atomically claim coupon usage BEFORE order creation
    if (couponResult?.couponId) {
      const claimed = await couponService.claimUsage(couponResult.couponId);
      if (!claimed) {
        return NextResponse.json({ error: 'Coupon invalide ou limite atteinte' }, { status: 400 });
      }
    }

    // A paid table never marked served frees itself after a delay: run that
    // rule now so this order opens a NEW session instead of joining the old
    // bill (owner decision 2026-11-15). Best-effort, never blocks the order.
    if (service_type === 'dine_in' && ticketTable) {
      await orderService.releaseStaleSessions(tenant_id, ticketTable);
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
        tableNumber: ticketTable,
        notes: ticketNotes,
        service_type,
        room_number,
        delivery_address,
        subtotal: pricing.subtotal,
        tax_amount: pricing.taxAmount,
        service_charge_amount: pricing.serviceChargeAmount,
        discount_amount: pricing.discountAmount,
        tip_amount: tipValue,
        coupon_id: couponResult?.couponId,
        // F2: le POS n'envoyait PAS display_currency. `toMinorUnits(x, undefined)`
        // retombait alors sur XAF, zero decimale: pour un tenant en EUR, 12,50
        // devenait 13, relu 0,13 EUR. Facteur 100 dans l'autre sens que la
        // vitrine. La devise de comptabilisation est passee explicitement.
        display_currency: tenant.currency ?? 'XAF',
        server_id: adminUser.id,
        verifiedPrices,
        verifiedLabels,
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
      const dedupPayment = payment_method
        ? await applyPosPayment(adminSupabase, result.orderId, tenant_id, payment_method)
        : undefined;
      return orderResponse(
        {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          total: result.total,
          deduplicated: true,
        },
        dedupPayment,
      );
    }

    // 10. Record the payment, if any (idempotent). The order itself stays
    // 'pending': it goes to the kitchen whether paid or not. `paid` tells the
    // till whether the money is really booked.
    const payment = payment_method
      ? await applyPosPayment(adminSupabase, result.orderId, tenant_id, payment_method)
      : undefined;

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

    // 10c. Owner decision 2026-11-14: the waiter who sends a dine-in ticket to the
    // kitchen becomes that table's server (unless it already has one), so the
    // Service floor shows who to call when it is ready. Best-effort: an
    // assignment problem must never fail an order that is already created.
    // Server assignment is a Pro feature (canAccessService): on Starter there is
    // no Service floor to show it on, and the database refuses the row.
    if (service_type === 'dine_in' && adminUser.role === 'waiter' && planLimits.canAccessService) {
      try {
        const { data: placed } = await adminSupabase
          .from('orders')
          .select('table_id')
          .eq('id', result.orderId)
          .eq('tenant_id', tenant_id)
          .maybeSingle();
        if (placed?.table_id) {
          await createAssignmentService(adminSupabase).assignIfFree(
            tenant_id,
            placed.table_id,
            adminUser.id,
          );
        }
      } catch (assignError) {
        logger.warn('POS order: table auto-assignment failed', {
          orderId: result.orderId,
          assignError,
        });
      }
    }

    // 11. Create in-app notification (fire-and-forget, non-blocking)
    //
    // PAS DE PUSH ICI, ET C'EST UNE DECISION, PAS UN OUBLI. Une commande de
    // caisse est saisie par un membre du personnel qui est devant l'ecran: il
    // la connait deja. L'ecran de cuisine la recoit en temps reel
    // (`useKitchenData` -> `useRealtimeSubscription`). Un push reveillerait
    // donc des appareils pour une information que personne n'attend, en
    // commencant par celui qui vient de la saisir. Le push est reserve aux
    // evenements que PERSONNE ne regarde au moment ou ils arrivent: une
    // commande passee par un convive, et une rupture de stock.
    void Promise.resolve(
      adminSupabase.from('notifications').insert({
        tenant_id,
        user_id: null,
        type: 'info',
        title: ticketTable
          ? `Nouvelle commande POS - Table ${ticketTable}`
          : `Nouvelle commande POS - ${result.orderNumber}`,
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
      // Same scheduler as the convive channel: a bare fire-and-forget promise is
      // raced by the serverless freeze that follows the response, so the destock
      // could simply never run - and an offline replay of this order returns
      // early, so it would never get a second chance either.
      scheduleDestock(adminSupabase, {
        orderId: result.orderId,
        tenantId: tenant_id,
        createdBy: user.id,
        channel: 'pos',
      });
    }

    return orderResponse(
      { orderId: result.orderId, orderNumber: result.orderNumber, total: result.total },
      payment,
    );
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
