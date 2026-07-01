/**
 * Integration tests for the stock engine RPCs against a REAL local Postgres.
 *
 * The unit suite (src/services/__tests__/inventory.service.test.ts) mocks
 * supabase.rpc, so the load-bearing SQL - recipe multiplication, tenant scoping,
 * idempotency guards, auto-unavailable/auto-available flips, is_low threshold -
 * is never executed. These tests close that gap by calling the RPCs for real and
 * asserting the resulting rows, which is the only way to catch a silent SQL
 * regression in the inventory engine (audit risk #1).
 *
 * Driven by `pnpm test:db` (scripts/run-stock-integration.sh): it boots a local
 * Supabase, loads the prod schema snapshot + post-marker migrations, and injects
 * JOURNEY_SUPABASE_URL / JOURNEY_SUPABASE_SERVICE_ROLE_KEY. Reuses the journeys
 * seed/env helpers (same prod-ref denylist guard).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';

const SLUG = 'stock-integration-test';
const db = getAdmin();

let tenantId: string;
let categoryId: string;

/** Insert an ingredient (current_stock defaults to 0). */
async function seedIngredient(opts: {
  unit?: string;
  minAlert?: number;
  name?: string;
}): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: opts.name ?? `Ing-${randomUUID().slice(0, 8)}`,
      unit: opts.unit ?? 'kg',
      min_stock_alert: opts.minAlert ?? 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  return data.id;
}

/** Insert a menu item under the shared category. */
async function seedMenuItem(): Promise<string> {
  const { data, error } = await db
    .from('menu_items')
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name: `Item-${randomUUID().slice(0, 8)}`,
      price: 2500,
      is_available: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed menu_item: ${error?.message}`);
  return data.id;
}

async function seedRecipe(menuItemId: string, ingredientId: string, quantityNeeded: number) {
  const { error } = await db.from('recipes').insert({
    tenant_id: tenantId,
    menu_item_id: menuItemId,
    ingredient_id: ingredientId,
    quantity_needed: quantityNeeded,
  });
  if (error) throw new Error(`seed recipe: ${error.message}`);
}

/** Create an order + one order_item for the given menu item/quantity. */
async function seedOrderWithItem(menuItemId: string, quantity: number): Promise<string> {
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `IT-${randomUUID().slice(0, 12)}`,
      status: 'pending',
      subtotal: 2500,
      total: 2500,
      preparation_zone: 'kitchen',
    })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`seed order: ${oErr?.message}`);
  const { error: iErr } = await db.from('order_items').insert({
    order_id: order.id,
    menu_item_id: menuItemId,
    quantity,
    price_at_order: 2500,
    item_name: 'Item',
  });
  if (iErr) throw new Error(`seed order_item: ${iErr.message}`);
  return order.id;
}

async function getStock(ingredientId: string): Promise<number> {
  const { data, error } = await db
    .from('ingredients')
    .select('current_stock')
    .eq('id', ingredientId)
    .single();
  if (error || !data) throw new Error(`read stock: ${error?.message}`);
  return Number(data.current_stock);
}

async function getIsAvailable(menuItemId: string): Promise<boolean> {
  const { data, error } = await db
    .from('menu_items')
    .select('is_available')
    .eq('id', menuItemId)
    .single();
  if (error || !data) throw new Error(`read is_available: ${error?.message}`);
  return Boolean(data.is_available);
}

async function isLow(ingredientId: string): Promise<boolean> {
  const { data, error } = await db.rpc('get_stock_status', { p_tenant_id: tenantId });
  if (error) throw new Error(`get_stock_status: ${error.message}`);
  const row = (data as { id: string; is_low: boolean }[]).find((r) => r.id === ingredientId);
  if (!row) throw new Error('ingredient absent from get_stock_status');
  return row.is_low;
}

async function countDestockMovements(orderId: string): Promise<number> {
  const { data, error } = await db
    .from('stock_movements')
    .select('id')
    .eq('reference_id', orderId)
    .eq('movement_type', 'order_destock');
  if (error) throw new Error(`count movements: ${error.message}`);
  return (data ?? []).length;
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Stock Integration', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'Menu IT', slug: 'menu-it' })
    .select('id')
    .single();
  if (mErr || !menu) throw new Error(`seed menu: ${mErr?.message}`);

  const { data: category, error: cErr } = await db
    .from('categories')
    .insert({ tenant_id: tenantId, menu_id: menu.id, name: 'Plats' })
    .select('id')
    .single();
  if (cErr || !category) throw new Error(`seed category: ${cErr?.message}`);
  categoryId = category.id;
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
});

describe('stock engine RPCs (real Postgres)', () => {
  it('destock_order decrements by quantity_needed * quantity and records a movement', async () => {
    const ing = await seedIngredient({ minAlert: 0 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 0.2); // 200 g per plate
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 10,
    });
    const orderId = await seedOrderWithItem(item, 3); // 3 plates

    const { error } = await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    expect(error).toBeNull();

    // 10 - (0.2 * 3) = 9.4
    expect(await getStock(ing)).toBeCloseTo(9.4, 3);
    expect(await countDestockMovements(orderId)).toBe(1);
  });

  it('destock_order is idempotent (double call decrements once)', async () => {
    const ing = await seedIngredient({ minAlert: 0 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 5,
    });
    const orderId = await seedOrderWithItem(item, 2);

    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    const afterFirst = await getStock(ing);
    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    const afterSecond = await getStock(ing);

    expect(afterFirst).toBeCloseTo(3, 3); // 5 - 2
    expect(afterSecond).toBeCloseTo(3, 3); // unchanged by the replay
    expect(await countDestockMovements(orderId)).toBe(1);
  });

  it('crossing min_stock_alert (stock still > 0) flags is_low', async () => {
    const ing = await seedIngredient({ minAlert: 5 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 6,
    });

    expect(await isLow(ing)).toBe(false); // 6 > 5
    const orderId = await seedOrderWithItem(item, 2); // -> 4
    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });

    expect(await getStock(ing)).toBeCloseTo(4, 3);
    expect(await isLow(ing)).toBe(true); // 4 <= 5
  });

  it('depleting to 0 auto-disables the menu item; restock re-enables it', async () => {
    const ing = await seedIngredient({ minAlert: 0 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 2,
    });
    const orderId = await seedOrderWithItem(item, 2); // exactly depletes to 0

    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    expect(await getStock(ing)).toBeCloseTo(0, 3);
    expect(await getIsAvailable(item)).toBe(false);

    // Cancellation path: restock reverses the destock and re-enables the item.
    const { error } = await db.rpc('restock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    expect(error).toBeNull();
    expect(await getStock(ing)).toBeCloseTo(2, 3);
    expect(await getIsAvailable(item)).toBe(true);

    // Idempotent: a second restock is a no-op.
    await db.rpc('restock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    expect(await getStock(ing)).toBeCloseTo(2, 3);
  });

  it('remaining stock = opening - sales', async () => {
    const ing = await seedIngredient({ minAlert: 0 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 0.5);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 20,
    });

    const o1 = await seedOrderWithItem(item, 4); // -2.0
    const o2 = await seedOrderWithItem(item, 6); // -3.0
    await db.rpc('destock_order', { p_order_id: o1, p_tenant_id: tenantId });
    await db.rpc('destock_order', { p_order_id: o2, p_tenant_id: tenantId });

    // 20 - (0.5*4) - (0.5*6) = 15
    expect(await getStock(ing)).toBeCloseTo(15, 3);
  });

  it('beverage threshold works identically (bouteille, seuil 10)', async () => {
    const ing = await seedIngredient({ unit: 'bouteille', minAlert: 10, name: 'Coca 33cl' });
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 10,
    });
    // 10 <= 10 -> low
    expect(await isLow(ing)).toBe(true);
  });

  it('destock_order for the wrong tenant has no effect (multi-tenant isolation)', async () => {
    const ing = await seedIngredient({ minAlert: 0 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 8,
    });
    const orderId = await seedOrderWithItem(item, 3);

    const foreignTenant = randomUUID();
    const { data: count } = await db.rpc('destock_order', {
      p_order_id: orderId,
      p_tenant_id: foreignTenant,
    });

    expect(Number(count)).toBe(0); // no order_items matched under the foreign tenant
    expect(await getStock(ing)).toBeCloseTo(8, 3); // untouched
    expect(await countDestockMovements(orderId)).toBe(0);
  });
});
