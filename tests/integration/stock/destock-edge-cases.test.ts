/**
 * Edge-case integration tests for the stock engine, against a REAL local
 * Postgres (same harness as inventory-rpcs.test.ts: `pnpm test:db`).
 *
 * inventory-rpcs.test.ts covers the happy path (recipe multiplication, tenant
 * isolation, idempotency, auto-unavailable). This file covers the cases an
 * owner actually hits in service and which no test pinned down:
 *   - a dish with NO recipe
 *   - stock short on ONE line of a multi-ingredient recipe (every line is
 *     still deducted, the short one goes negative - owner decision C-048)
 *   - a cancellation restock must not un-hide a dish the owner hid by hand
 *   - an order whose items change after the destock already ran
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';

const SLUG = 'stock-edge-cases-test';
const db = getAdmin();

let tenantId: string;
let categoryId: string;

async function seedIngredient(opts: { stock?: number; unit?: string } = {}): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: `Ing-${randomUUID().slice(0, 8)}`,
      unit: opts.unit ?? 'kg',
      min_stock_alert: 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  if (opts.stock !== undefined) {
    const { error: sErr } = await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: data.id,
      p_quantity: opts.stock,
    });
    if (sErr) throw new Error(`set_opening_stock: ${sErr.message}`);
  }
  return data.id;
}

async function seedMenuItem(isAvailable = true): Promise<string> {
  const { data, error } = await db
    .from('menu_items')
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name: `Item-${randomUUID().slice(0, 8)}`,
      price: 2500,
      is_available: isAvailable,
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

async function seedOrderWithItem(menuItemId: string, quantity: number): Promise<string> {
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `EC-${randomUUID().slice(0, 12)}`,
      status: 'pending',
      subtotal: 2500,
      total: 2500,
      preparation_zone: 'kitchen',
    })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`seed order: ${oErr?.message}`);
  await addOrderItem(order.id, menuItemId, quantity);
  return order.id;
}

async function addOrderItem(orderId: string, menuItemId: string, quantity: number) {
  const { error } = await db.from('order_items').insert({
    order_id: orderId,
    menu_item_id: menuItemId,
    quantity,
    price_at_order: 2500,
    item_name: 'Item',
  });
  if (error) throw new Error(`seed order_item: ${error.message}`);
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

async function countMovements(orderId: string, type: string): Promise<number> {
  const { data, error } = await db
    .from('stock_movements')
    .select('id')
    .eq('reference_id', orderId)
    .eq('movement_type', type);
  if (error) throw new Error(`count movements: ${error.message}`);
  return (data ?? []).length;
}

const destock = (orderId: string) =>
  db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
const restock = (orderId: string) =>
  db.rpc('restock_order', { p_order_id: orderId, p_tenant_id: tenantId });

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Stock Edge Cases', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'Menu EC', slug: 'menu-ec' })
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

describe('destock edge cases (real Postgres)', () => {
  it('a dish with NO recipe destocks nothing and raises no error', async () => {
    const item = await seedMenuItem();
    const orderId = await seedOrderWithItem(item, 3);

    const { data, error } = await destock(orderId);

    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await countMovements(orderId, 'order_destock')).toBe(0);
  });

  it('short stock on ONE recipe line still deducts EVERY line (C-048)', async () => {
    const plenty = await seedIngredient({ stock: 10 });
    const short = await seedIngredient({ stock: 0.1 });
    const item = await seedMenuItem();
    await seedRecipe(item, plenty, 1);
    await seedRecipe(item, short, 1);
    const orderId = await seedOrderWithItem(item, 1);

    const { error } = await destock(orderId);

    // Before C-048 the whole call rolled back: NOTHING was deducted, not even
    // the ingredient that had enough, and the stock stayed wrong.
    expect(error).toBeNull();
    expect(await getStock(plenty)).toBe(9);
    expect(await getStock(short)).toBe(-0.9);
    expect(await countMovements(orderId, 'order_destock')).toBe(2);
  });

  it('a restock must NOT un-hide a dish the owner hid by hand', async () => {
    const shared = await seedIngredient({ stock: 5 });
    const sold = await seedMenuItem();
    const hiddenByOwner = await seedMenuItem(false);
    await seedRecipe(sold, shared, 1);
    await seedRecipe(hiddenByOwner, shared, 1);

    const orderId = await seedOrderWithItem(sold, 1);
    expect((await destock(orderId)).error).toBeNull();
    expect(await getStock(shared)).toBe(4);
    // The owner's dish was hidden before the order and has nothing to do with it.
    expect(await getIsAvailable(hiddenByOwner)).toBe(false);

    expect((await restock(orderId)).error).toBeNull();
    expect(await getStock(shared)).toBe(5);

    expect(await getIsAvailable(hiddenByOwner)).toBe(false);
  });

  it('the history names the ORDER that took the ingredients out', async () => {
    const ing = await seedIngredient({ stock: 10 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 2);
    const orderId = await seedOrderWithItem(item, 1);
    const { data: order } = await db
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .single();

    expect((await destock(orderId)).error).toBeNull();

    const { data: rows, error } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 200,
      p_offset: 0,
    });
    expect(error).toBeNull();
    const row = (rows as { reference_id: string; order_number: string | null }[]).find(
      (r) => r.reference_id === orderId,
    );
    // Without this, the owner reads "Riz -4" with no way to know which order.
    expect(row?.order_number).toBe(order?.order_number);
  });

  it('an item added to the order AFTER the destock is never deducted', async () => {
    const ing = await seedIngredient({ stock: 10 });
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    const orderId = await seedOrderWithItem(item, 1);

    expect((await destock(orderId)).error).toBeNull();
    expect(await getStock(ing)).toBe(9);

    // A second helping is added to the same order, then the destock is retried.
    await addOrderItem(orderId, item, 2);
    const { data } = await destock(orderId);

    expect(data).toBe(0);
    expect(await getStock(ing)).toBe(9);
  });
});
