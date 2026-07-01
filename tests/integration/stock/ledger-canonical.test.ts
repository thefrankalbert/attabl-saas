/**
 * Integration tests for the canonical stock ledger (phase 2) against a real
 * local Postgres. Verifies the additive migration 20260701140000: created_by
 * stamping on destock/restock/opening, opening recorded as a DELTA (ledger
 * invariant SUM == current_stock), the reason_code CHECK, and the widened
 * movement_type CHECK. Driven by `pnpm test:db`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';

const SLUG = 'ledger-canonical-test';
const db = getAdmin();
let tenantId: string;
let categoryId: string;

async function seedIngredient(): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: `Ing-${randomUUID().slice(0, 8)}`,
      unit: 'kg',
      min_stock_alert: 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  return data.id;
}

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

async function seedOrderWithItem(menuItemId: string, quantity: number): Promise<string> {
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `LC-${randomUUID().slice(0, 12)}`,
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

async function movementsFor(ingredientId: string) {
  const { data, error } = await db
    .from('stock_movements')
    .select('movement_type, quantity, created_by, reason_code')
    .eq('tenant_id', tenantId)
    .eq('ingredient_id', ingredientId);
  if (error) throw new Error(`movements: ${error.message}`);
  return data ?? [];
}

async function getStock(ingredientId: string): Promise<number> {
  const { data } = await db
    .from('ingredients')
    .select('current_stock')
    .eq('id', ingredientId)
    .single();
  return Number(data?.current_stock);
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Ledger Canonical', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;
  const { data: menu } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'M', slug: 'm-lc' })
    .select('id')
    .single();
  const { data: cat, error: cErr } = await db
    .from('categories')
    .insert({ tenant_id: tenantId, menu_id: menu!.id, name: 'Plats' })
    .select('id')
    .single();
  if (cErr || !cat) throw new Error(`seed category: ${cErr?.message}`);
  categoryId = cat.id;
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
});

describe('canonical stock ledger (real Postgres)', () => {
  it('stamps created_by on order_destock when passed, NULL for the system path', async () => {
    const actor = randomUUID();
    const ingA = await seedIngredient();
    const itemA = await seedMenuItem();
    await db.from('recipes').insert({
      tenant_id: tenantId,
      menu_item_id: itemA,
      ingredient_id: ingA,
      quantity_needed: 1,
    });
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ingA,
      p_quantity: 10,
    });
    const withActor = await seedOrderWithItem(itemA, 1);
    await db.rpc('destock_order', {
      p_order_id: withActor,
      p_tenant_id: tenantId,
      p_created_by: actor,
    });

    const ingB = await seedIngredient();
    const itemB = await seedMenuItem();
    await db.from('recipes').insert({
      tenant_id: tenantId,
      menu_item_id: itemB,
      ingredient_id: ingB,
      quantity_needed: 1,
    });
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ingB,
      p_quantity: 10,
    });
    const noActor = await seedOrderWithItem(itemB, 1);
    await db.rpc('destock_order', { p_order_id: noActor, p_tenant_id: tenantId }); // system path, no p_created_by

    const destockA = (await movementsFor(ingA)).find((m) => m.movement_type === 'order_destock');
    const destockB = (await movementsFor(ingB)).find((m) => m.movement_type === 'order_destock');
    expect(destockA?.created_by).toBe(actor);
    expect(destockB?.created_by).toBeNull();
  });

  it('records opening as a DELTA and keeps SUM(movements) == current_stock', async () => {
    const ing = await seedIngredient();
    const actor = randomUUID();
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 8,
      p_created_by: actor,
    });
    // Re-open at 5: the delta movement must be -3, not the absolute 5.
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 5,
      p_created_by: actor,
    });

    const movs = await movementsFor(ing);
    const openings = movs
      .filter((m) => m.movement_type === 'opening')
      .map((m) => Number(m.quantity));
    expect(openings).toEqual([8, -3]); // first from 0 -> +8, then 8 -> 5 => -3
    expect(movs.every((m) => m.created_by === actor)).toBe(true);
    const sum = movs.reduce((acc, m) => acc + Number(m.quantity), 0);
    expect(sum).toBeCloseTo(await getStock(ing), 3); // ledger invariant
  });

  it('restock_order stamps created_by and stays idempotent', async () => {
    const actor = randomUUID();
    const ing = await seedIngredient();
    const item = await seedMenuItem();
    await db
      .from('recipes')
      .insert({ tenant_id: tenantId, menu_item_id: item, ingredient_id: ing, quantity_needed: 2 });
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 10,
    });
    const orderId = await seedOrderWithItem(item, 2);
    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });

    await db.rpc('restock_order', {
      p_order_id: orderId,
      p_tenant_id: tenantId,
      p_created_by: actor,
    });
    await db.rpc('restock_order', {
      p_order_id: orderId,
      p_tenant_id: tenantId,
      p_created_by: actor,
    }); // idempotent

    const restocks = (await movementsFor(ing)).filter((m) => m.movement_type === 'order_restock');
    expect(restocks).toHaveLength(1);
    expect(restocks[0].created_by).toBe(actor);
    expect(await getStock(ing)).toBeCloseTo(10, 3);
  });

  it('reason_code CHECK rejects an out-of-enum value and accepts a valid one', async () => {
    const ing = await seedIngredient();
    const bad = await db.from('stock_movements').insert({
      tenant_id: tenantId,
      ingredient_id: ing,
      movement_type: 'adjustment',
      quantity: -1,
      reason_code: 'bogus',
    });
    expect(bad.error).not.toBeNull();
    expect(bad.error?.code).toBe('23514'); // check_violation

    const ok = await db.from('stock_movements').insert({
      tenant_id: tenantId,
      ingredient_id: ing,
      movement_type: 'loss',
      quantity: -1,
      reason_code: 'breakage',
    });
    expect(ok.error).toBeNull();
  });

  it('movement_type CHECK accepts the new ledger types', async () => {
    const ing = await seedIngredient();
    for (const type of ['physical_count', 'loss', 'transfer_in', 'transfer_out']) {
      const res = await db
        .from('stock_movements')
        .insert({ tenant_id: tenantId, ingredient_id: ing, movement_type: type, quantity: 1 });
      expect(res.error, `type ${type} should be allowed`).toBeNull();
    }
  });
});
