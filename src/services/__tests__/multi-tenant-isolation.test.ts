/**
 * Multi-tenant isolation tests.
 *
 * These tests seed TWO tenants (A and B) into an argument-aware Supabase mock
 * and assert that every service method:
 *   (a) READS only the calling tenant's rows (never the other tenant's),
 *   (b) WRITES (update/delete) scoped to tenant A against a B-owned row touch
 *       ZERO rows (mock.affected[table] === 0),
 *   (c) has a CONTROL where the correct tenant matches exactly one row.
 *
 * They are designed to FAIL if a service dropped its `.eq('tenant_id', ...)`
 * filter: without it the mock would return foreign rows (read leak) or report
 * a non-zero affected count (write leak). This is the regression guard the
 * "belt-and-suspenders" tenant filtering exists for.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createArgAwareSupabaseMock,
  type ArgAwareSupabaseMock,
} from './helpers/arg-aware-supabase-mock';
import { createOrderService } from '../order.service';
import { createMenuItemService } from '../menu-item.service';
import { createCategoryService } from '../category.service';
import { createCouponService } from '../coupon.service';
import { createModifierService } from '../modifier.service';
import { createTableConfigService } from '../table-config.service';
import { ServiceError } from '../errors';
import type { OrderItemInput } from '@/lib/validations/order.schema';

const TENANT_A = 'tenant-aaaa';
const TENANT_B = 'tenant-bbbb';

function asClient(mock: ArgAwareSupabaseMock): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

// ----------------------------- order.service -----------------------------

describe('order.service multi-tenant isolation', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    db.seed('orders', [
      {
        id: 'order-A',
        tenant_id: TENANT_A,
        status: 'ready',
        created_at: '2026-06-18T08:00:00.000Z',
      },
      {
        id: 'order-B',
        tenant_id: TENANT_B,
        status: 'ready',
        created_at: '2026-06-18T09:00:00.000Z',
      },
    ]);
  });

  it('updateStatus on a B-owned order with tenant A id touches ZERO rows', async () => {
    const service = createOrderService(asClient(db));
    // updateStatus now reads the order tenant-scoped first; a cross-tenant id
    // matches nothing -> NOT_FOUND, and crucially performs ZERO writes.
    await expect(service.updateStatus('order-B', TENANT_A, 'delivered')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // No UPDATE ran at all (undefined) - which is itself zero cross-tenant writes.
    expect(db.affected.orders ?? 0).toBe(0);
    // The B order keeps its original status (no cross-tenant write).
    const orderB = db.rows('orders').find((r) => r.id === 'order-B');
    expect(orderB?.status).toBe('ready');
  });

  it('updateStatus control: tenant A on its own order touches exactly 1 row', async () => {
    const service = createOrderService(asClient(db));
    await service.updateStatus('order-A', TENANT_A, 'delivered');
    expect(db.affected.orders).toBe(1);
    const orderA = db.rows('orders').find((r) => r.id === 'order-A');
    expect(orderA?.status).toBe('delivered');
  });

  it('markPaid on a B-owned order with tenant A id touches ZERO rows', async () => {
    const service = createOrderService(asClient(db));
    await service.markPaid('order-B', TENANT_A, { method: 'cash' });
    expect(db.affected.orders).toBe(0);
    const orderB = db.rows('orders').find((r) => r.id === 'order-B');
    expect(orderB?.payment_status).toBeUndefined();
  });

  it('markPaid control: tenant A on its own order touches exactly 1 row', async () => {
    const service = createOrderService(asClient(db));
    await service.markPaid('order-A', TENANT_A, { method: 'cash', tipAmount: 500 });
    expect(db.affected.orders).toBe(1);
    const orderA = db.rows('orders').find((r) => r.id === 'order-A');
    expect(orderA?.payment_status).toBe('paid');
    expect(orderA?.tip_amount).toBe(500);
  });

  it('listReadyOrdersToday returns ONLY tenant A orders, never tenant B', async () => {
    // Re-seed with fresh "today" timestamps so the gte(created_at) filter passes.
    const now = new Date().toISOString();
    db.seed('orders', [
      { id: 'order-A', tenant_id: TENANT_A, status: 'ready', created_at: now },
      { id: 'order-B', tenant_id: TENANT_B, status: 'ready', created_at: now },
    ]);
    const service = createOrderService(asClient(db));
    const rows = (await service.listReadyOrdersToday(TENANT_A)) as Array<{ tenant_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
    expect(rows.some((r) => r.tenant_id === TENANT_B)).toBe(false);
  });

  it('previewOrderItems resolves prices ONLY from tenant A menu_items', async () => {
    const sharedId = '11111111-1111-1111-1111-111111111111';
    // Both tenants own a menu item with the SAME id (only possible in a mock,
    // but it proves the tenant filter is what selects the right row): A=1000, B=9999.
    db.seed('menu_items', [
      {
        id: sharedId,
        tenant_id: TENANT_A,
        name: 'Cafe',
        price: 1000,
        is_available: true,
        category_id: 'cat-A',
        deleted_at: null,
      },
      {
        id: sharedId,
        tenant_id: TENANT_B,
        name: 'Cafe',
        price: 9999,
        is_available: true,
        category_id: 'cat-B',
        deleted_at: null,
      },
    ]);
    db.seed('item_modifiers', []);
    db.seed('item_price_variants', []);

    const service = createOrderService(asClient(db));
    const items: OrderItemInput[] = [{ id: sharedId, name: 'Cafe', price: 1000, quantity: 1 }];
    const preview = await service.previewOrderItems(TENANT_A, items);

    // Server-verified price must be tenant A's 1000, never tenant B's 9999.
    expect(preview.verifiedPrices.get(sharedId)).toBe(1000);
    expect(preview.validatedSubtotal).toBe(1000);
    expect(preview.valid).toBe(true);
  });
});

// --------------------------- menu-item.service ---------------------------

describe('menu-item.service multi-tenant isolation', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    db.seed('menu_items', [
      { id: 'item-A', tenant_id: TENANT_A, name: 'Plat A', is_available: true, deleted_at: null },
      { id: 'item-B', tenant_id: TENANT_B, name: 'Plat B', is_available: true, deleted_at: null },
    ]);
  });

  it('updateMenuItem with tenant A id on a B-owned item touches ZERO rows', async () => {
    const service = createMenuItemService(asClient(db));
    await service.updateMenuItem('item-B', TENANT_A, { name: 'Hacked' });
    expect(db.affected.menu_items).toBe(0);
    expect(db.rows('menu_items').find((r) => r.id === 'item-B')?.name).toBe('Plat B');
  });

  it('updateMenuItem control: tenant A on its own item touches exactly 1 row', async () => {
    const service = createMenuItemService(asClient(db));
    await service.updateMenuItem('item-A', TENANT_A, { name: 'Renomme' });
    expect(db.affected.menu_items).toBe(1);
    expect(db.rows('menu_items').find((r) => r.id === 'item-A')?.name).toBe('Renomme');
  });

  it('deleteMenuItem (soft-delete) with tenant A on a B-owned item touches ZERO rows', async () => {
    const service = createMenuItemService(asClient(db));
    await service.deleteMenuItem('item-B', TENANT_A);
    expect(db.affected.menu_items).toBe(0);
    expect(db.rows('menu_items').find((r) => r.id === 'item-B')?.deleted_at).toBeNull();
  });

  it('deleteMenuItem control: tenant A soft-deletes its own item (1 row, deleted_at set)', async () => {
    const service = createMenuItemService(asClient(db));
    await service.deleteMenuItem('item-A', TENANT_A);
    expect(db.affected.menu_items).toBe(1);
    expect(db.rows('menu_items').find((r) => r.id === 'item-A')?.deleted_at).not.toBeNull();
  });

  it('toggleAvailable with tenant A on a B-owned item touches ZERO rows', async () => {
    const service = createMenuItemService(asClient(db));
    await service.toggleAvailable('item-B', false, TENANT_A);
    expect(db.affected.menu_items).toBe(0);
    expect(db.rows('menu_items').find((r) => r.id === 'item-B')?.is_available).toBe(true);
  });
});

// ---------------------------- category.service ---------------------------

describe('category.service multi-tenant isolation', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    db.seed('categories', [
      { id: 'cat-A', tenant_id: TENANT_A, display_order: 1, menu_id: 'menu-A' },
      { id: 'cat-B', tenant_id: TENANT_B, display_order: 1, menu_id: null },
    ]);
  });

  it('reorderCategories with tenant A on a B-owned category touches ZERO rows', async () => {
    const service = createCategoryService(asClient(db));
    await service.reorderCategories(TENANT_A, [{ id: 'cat-B', display_order: 99 }]);
    expect(db.affected.categories).toBe(0);
    expect(db.rows('categories').find((r) => r.id === 'cat-B')?.display_order).toBe(1);
  });

  it('reorderCategories control: tenant A reorders its own category (1 row)', async () => {
    const service = createCategoryService(asClient(db));
    await service.reorderCategories(TENANT_A, [{ id: 'cat-A', display_order: 5 }]);
    expect(db.affected.categories).toBe(1);
    expect(db.rows('categories').find((r) => r.id === 'cat-A')?.display_order).toBe(5);
  });

  it('isCategoryLinkedToMenu cannot read a B-owned category from tenant A', async () => {
    const service = createCategoryService(asClient(db));
    // cat-B is linked to a menu, but tenant A must not see it: scoped read
    // returns null -> linked === false.
    const linked = await service.isCategoryLinkedToMenu('cat-B', TENANT_A);
    expect(linked).toBe(false);
  });

  it('isCategoryLinkedToMenu control: tenant A reads its own linked category', async () => {
    const service = createCategoryService(asClient(db));
    const linked = await service.isCategoryLinkedToMenu('cat-A', TENANT_A);
    expect(linked).toBe(true);
  });
});

// ----------------------------- coupon.service ----------------------------

describe('coupon.service multi-tenant isolation', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    // SAME code on BOTH tenants, different discount values.
    db.seed('coupons', [
      {
        id: 'coupon-A',
        tenant_id: TENANT_A,
        code: 'PROMO10',
        discount_type: 'fixed',
        discount_value: 1000,
        min_order_amount: 0,
        max_discount_amount: null,
        valid_from: null,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'coupon-B',
        tenant_id: TENANT_B,
        code: 'PROMO10',
        discount_type: 'fixed',
        discount_value: 9999,
        min_order_amount: 0,
        max_discount_amount: null,
        valid_from: null,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('validateCoupon resolves the SAME code to tenant A coupon, never tenant B', async () => {
    const service = createCouponService(asClient(db));
    const result = await service.validateCoupon('PROMO10', TENANT_A, 5000);
    expect(result.valid).toBe(true);
    expect(result.coupon?.id).toBe('coupon-A');
    expect(result.discountAmount).toBe(1000);
    // Must NOT have picked tenant B's 9999 coupon.
    expect(result.coupon?.id).not.toBe('coupon-B');
    expect(result.discountAmount).not.toBe(9999);
  });

  it('validateCoupon control: tenant B resolves the same code to its own coupon', async () => {
    const service = createCouponService(asClient(db));
    const result = await service.validateCoupon('PROMO10', TENANT_B, 50000);
    expect(result.valid).toBe(true);
    expect(result.coupon?.id).toBe('coupon-B');
    expect(result.discountAmount).toBe(9999);
  });

  it('deleteCoupon with tenant A on a B-owned coupon touches ZERO rows', async () => {
    const service = createCouponService(asClient(db));
    await service.deleteCoupon('coupon-B', TENANT_A);
    expect(db.affected.coupons).toBe(0);
    expect(db.rows('coupons').some((r) => r.id === 'coupon-B')).toBe(true);
  });

  it('deleteCoupon control: tenant A deletes its own coupon (1 row removed)', async () => {
    const service = createCouponService(asClient(db));
    await service.deleteCoupon('coupon-A', TENANT_A);
    expect(db.affected.coupons).toBe(1);
    expect(db.rows('coupons').some((r) => r.id === 'coupon-A')).toBe(false);
  });

  it('toggleActive with tenant A on a B-owned coupon touches ZERO rows', async () => {
    const service = createCouponService(asClient(db));
    await service.toggleActive('coupon-B', TENANT_A, false);
    expect(db.affected.coupons).toBe(0);
    expect(db.rows('coupons').find((r) => r.id === 'coupon-B')?.is_active).toBe(true);
  });

  it('listCoupons returns ONLY tenant A coupons, never tenant B', async () => {
    const service = createCouponService(asClient(db));
    const coupons = await service.listCoupons(TENANT_A);
    expect(coupons).toHaveLength(1);
    expect(coupons[0]?.id).toBe('coupon-A');
    expect(coupons.some((c) => c.tenant_id === TENANT_B)).toBe(false);
  });
});

// ---------------------------- modifier.service ---------------------------

describe('modifier.service multi-tenant isolation', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    db.seed('item_modifiers', [
      { id: 'mod-A', tenant_id: TENANT_A, name: 'Extra A', is_available: true },
      { id: 'mod-B', tenant_id: TENANT_B, name: 'Extra B', is_available: true },
    ]);
  });

  it('deleteModifier with tenant A on a B-owned modifier touches ZERO rows', async () => {
    const service = createModifierService(asClient(db));
    await service.deleteModifier('mod-B', TENANT_A);
    expect(db.affected.item_modifiers).toBe(0);
    expect(db.rows('item_modifiers').some((r) => r.id === 'mod-B')).toBe(true);
  });

  it('deleteModifier control: tenant A deletes its own modifier (1 row removed)', async () => {
    const service = createModifierService(asClient(db));
    await service.deleteModifier('mod-A', TENANT_A);
    expect(db.affected.item_modifiers).toBe(1);
    expect(db.rows('item_modifiers').some((r) => r.id === 'mod-A')).toBe(false);
  });

  it('toggleAvailable with tenant A on a B-owned modifier touches ZERO rows', async () => {
    const service = createModifierService(asClient(db));
    await service.toggleAvailable('mod-B', false, TENANT_A);
    expect(db.affected.item_modifiers).toBe(0);
    expect(db.rows('item_modifiers').find((r) => r.id === 'mod-B')?.is_available).toBe(true);
  });

  it('toggleAvailable control: tenant A toggles its own modifier (1 row)', async () => {
    const service = createModifierService(asClient(db));
    await service.toggleAvailable('mod-A', false, TENANT_A);
    expect(db.affected.item_modifiers).toBe(1);
    expect(db.rows('item_modifiers').find((r) => r.id === 'mod-A')?.is_available).toBe(false);
  });
});

// -------------------------- table-config.service -------------------------
// table-config isolates via the venue's tenant_id on an embedded relation.
// The service filters `.eq('venues.tenant_id', tenantId)` (zones) and
// `.eq('zones.venues.tenant_id', tenantId)` (tables). We seed rows with those
// dotted relation keys so the arg-aware mock can narrow on them.

describe('table-config.service multi-tenant isolation (relation tenant_id)', () => {
  let db: ArgAwareSupabaseMock;

  beforeEach(() => {
    db = createArgAwareSupabaseMock();
    db.seed('zones', [
      { id: 'zone-A', venue_id: 'venue-1', display_order: 1, 'venues.tenant_id': TENANT_A },
      { id: 'zone-B', venue_id: 'venue-1', display_order: 2, 'venues.tenant_id': TENANT_B },
    ]);
    db.seed('tables', [
      {
        id: 'table-A',
        zone_id: 'zone-1',
        table_number: 'INT-1',
        'zones.venues.tenant_id': TENANT_A,
      },
      {
        id: 'table-B',
        zone_id: 'zone-1',
        table_number: 'INT-2',
        'zones.venues.tenant_id': TENANT_B,
      },
    ]);
  });

  it('listZonesForVenue returns ONLY tenant A zones (relation tenant filter)', async () => {
    const service = createTableConfigService(asClient(db));
    const zones = (await service.listZonesForVenue(TENANT_A, 'venue-1')) as Array<{ id: string }>;
    expect(zones).toHaveLength(1);
    expect(zones[0]?.id).toBe('zone-A');
    expect(zones.some((z) => z.id === 'zone-B')).toBe(false);
  });

  it('listZonesForVenue control: tenant B sees only its own zone on the shared venue', async () => {
    const service = createTableConfigService(asClient(db));
    const zones = (await service.listZonesForVenue(TENANT_B, 'venue-1')) as Array<{ id: string }>;
    expect(zones).toHaveLength(1);
    expect(zones[0]?.id).toBe('zone-B');
  });

  it('listTablesForZone returns ONLY tenant A tables (relation tenant filter)', async () => {
    const service = createTableConfigService(asClient(db));
    const tables = (await service.listTablesForZone(TENANT_A, 'zone-1')) as Array<{ id: string }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]?.id).toBe('table-A');
    expect(tables.some((t) => t.id === 'table-B')).toBe(false);
  });

  it('listTablesForZone control: tenant B sees only its own table on the shared zone', async () => {
    const service = createTableConfigService(asClient(db));
    const tables = (await service.listTablesForZone(TENANT_B, 'zone-1')) as Array<{ id: string }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]?.id).toBe('table-B');
  });

  it('listZonesForVenue surfaces DB errors as ServiceError', async () => {
    db.forceError('zones', { message: 'boom', code: 'XX000' });
    const service = createTableConfigService(asClient(db));
    await expect(service.listZonesForVenue(TENANT_A, 'venue-1')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});
