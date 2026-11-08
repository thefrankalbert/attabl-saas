/**
 * Menu availability driven by stock, against a REAL local Postgres
 * (harness: `pnpm test:db`).
 *
 * The engine hides a dish when an ingredient runs out. These tests pin down the
 * other half, which nothing covered:
 *   - receiving stock / adjusting it must bring the dish BACK on the menu
 *   - a dish must not come back while another of its ingredients is still out
 *   - a dish the owner hid by hand must stay hidden
 *
 * Pinned by migration 20261108160000_menu_availability_sync.sql
 * (public.sync_menu_availability).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { createInventoryService } from '@/services/inventory.service';

const SLUG = 'stock-availability-test';
const db = getAdmin();

let tenantId: string;
let categoryId: string;

async function seedIngredient(stock: number): Promise<string> {
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
  if (stock !== 0) {
    const { error: sErr } = await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: data.id,
      p_quantity: stock,
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

async function getIsAvailable(menuItemId: string): Promise<boolean> {
  const { data, error } = await db
    .from('menu_items')
    .select('is_available')
    .eq('id', menuItemId)
    .single();
  if (error || !data) throw new Error(`read is_available: ${error?.message}`);
  return Boolean(data.is_available);
}

/** Receive stock through the canonical manual-add ledger path. */
async function receive(ingredientId: string, delta: number) {
  const { error } = await db.rpc('adjust_ingredient_stock_tx', {
    p_tenant_id: tenantId,
    p_ingredient_id: ingredientId,
    p_delta: delta,
    p_movement_type: 'manual_add',
  });
  if (error) throw new Error(`adjust_ingredient_stock_tx: ${error.message}`);
}

/** Drain an ingredient to exactly 0 through the loss ledger path. */
async function drainToZero(ingredientId: string, quantity: number) {
  const { error } = await db.rpc('record_loss_tx', {
    p_tenant_id: tenantId,
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
    p_reason_code: 'spillage',
  });
  if (error) throw new Error(`record_loss_tx: ${error.message}`);
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Stock Availability', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'Menu AV', slug: 'menu-av' })
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

describe('menu availability follows the stock (real Postgres)', () => {
  it('running out hides the dish, receiving stock puts it back', async () => {
    const ing = await seedIngredient(2);
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);

    await drainToZero(ing, 2);
    expect(await getIsAvailable(item)).toBe(false);

    await receive(ing, 5);
    expect(await getIsAvailable(item)).toBe(true);
  });

  it('a dish stays hidden while ANOTHER of its ingredients is still out', async () => {
    const back = await seedIngredient(2);
    const stillOut = await seedIngredient(0);
    const item = await seedMenuItem();
    await seedRecipe(item, back, 1);
    await seedRecipe(item, stillOut, 1);

    await drainToZero(back, 2);
    expect(await getIsAvailable(item)).toBe(false);

    await receive(back, 5);

    expect(await getIsAvailable(item)).toBe(false);
  });

  it('receiving stock does NOT un-hide a dish the owner hid by hand', async () => {
    const ing = await seedIngredient(5);
    const hiddenByOwner = await seedMenuItem(false);
    await seedRecipe(hiddenByOwner, ing, 1);

    // Stock never ran out: the engine has nothing to undo.
    await receive(ing, 5);

    expect(await getIsAvailable(hiddenByOwner)).toBe(false);
  });

  it('committing a physical count does NOT un-hide a dish the owner hid by hand', async () => {
    const ing = await seedIngredient(5);
    const hiddenByOwner = await seedMenuItem(false);
    await seedRecipe(hiddenByOwner, ing, 1);

    const { data: countId, error: openErr } = await db.rpc('open_stock_count', {
      p_tenant_id: tenantId,
      p_reference: `AV-${Date.now()}`,
      p_created_by: null,
      p_ingredient_ids: [ing],
    });
    if (openErr) throw new Error(`open_stock_count: ${openErr.message}`);

    const { error: saveErr } = await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId as string,
      p_lines: [{ ingredient_id: ing, counted_qty: 9 }],
    });
    if (saveErr) throw new Error(`save_stock_count_lines: ${saveErr.message}`);

    const { error: commitErr } = await db.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: countId as string,
      p_committed_by: null,
    });
    if (commitErr) throw new Error(`commit_stock_count: ${commitErr.message}`);

    expect(await getIsAvailable(hiddenByOwner)).toBe(false);
  });
});

describe('menu availability - cases that used to park a dish off the menu', () => {
  it('an ingredient DEACTIVATED since never blocks the dish from coming back', async () => {
    const back = await seedIngredient(2);
    const retired = await seedIngredient(0);
    const item = await seedMenuItem();
    await seedRecipe(item, back, 1);
    await seedRecipe(item, retired, 1);

    await drainToZero(back, 2);
    expect(await getIsAvailable(item)).toBe(false);

    // The owner stops stocking that ingredient but never edits the recipe. It
    // vanishes from the stock screens, so NO movement can ever lift it above 0.
    const { error } = await db
      .from('ingredients')
      .update({ is_active: false })
      .eq('id', retired)
      .eq('tenant_id', tenantId);
    expect(error).toBeNull();

    await receive(back, 5);

    // Without the is_active filter the dish would stay hidden for good.
    expect(await getIsAvailable(item)).toBe(true);
  });

  it('fixing the recipe brings the dish back without waiting for a stock movement', async () => {
    const missing = await seedIngredient(1);
    const plenty = await seedIngredient(10);
    const item = await seedMenuItem();
    await seedRecipe(item, missing, 1);

    await drainToZero(missing, 1);
    expect(await getIsAvailable(item)).toBe(false);

    // The owner swaps the missing ingredient for one in stock. No stock event
    // will ever happen on `missing` again, so only the recipe save can fix this.
    const { error } = await db.rpc('set_recipe_tx', {
      p_tenant_id: tenantId,
      p_menu_item_id: item,
      p_lines: [{ ingredient_id: plenty, quantity_needed: 1 }],
    });
    expect(error).toBeNull();

    expect(await getIsAvailable(item)).toBe(true);
  });

  it('a negative manual adjustment down to zero pulls the dish off the menu', async () => {
    const ing = await seedIngredient(4);
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    expect(await getIsAvailable(item)).toBe(true);

    // Correcting an inventory typo: a dish that cannot be made must not stay
    // orderable, exactly as when a sale or a loss empties the ingredient.
    await receive(ing, -4);

    expect(await getIsAvailable(item)).toBe(false);
  });
});

describe('creating an ingredient keeps the ledger honest (real Postgres)', () => {
  /**
   * The invariant the whole stock screen rests on:
   *   ingredients.current_stock == SUM(stock_movements.quantity)
   *
   * Creation used to write the opening quantity straight into the column with no
   * movement behind it, so every ingredient born with stock was adrift by exactly
   * that quantity, for life. Measured on prod 2026-11-08: 13 ingredients adrift
   * (Riz 60 / ledger 0). verify_stock_ledger is the project's own judge.
   */
  it('records the opening quantity as a movement, so the ledger shows no drift', async () => {
    const service = createInventoryService(db);

    const created = await service.createIngredient(tenantId, {
      name: `Opening-${randomUUID().slice(0, 8)}`,
      unit: 'kg',
      current_stock: 12.5,
      min_stock_alert: 1,
      cost_per_unit: 100,
    });

    expect(Number(created.current_stock)).toBe(12.5);

    const { data: movements, error: mErr } = await db
      .from('stock_movements')
      .select('movement_type, quantity')
      .eq('ingredient_id', created.id);
    expect(mErr).toBeNull();
    expect(movements).toHaveLength(1);
    expect(movements?.[0].movement_type).toBe('opening');
    expect(Number(movements?.[0].quantity)).toBe(12.5);

    const { data: drift, error: dErr } = await db.rpc('verify_stock_ledger', {
      p_tenant_id: tenantId,
    });
    expect(dErr).toBeNull();
    const row = (drift as { ingredient_id: string }[]).find((r) => r.ingredient_id === created.id);
    expect(row).toBeUndefined();
  });

  it('an ingredient created without stock writes no movement at all', async () => {
    const service = createInventoryService(db);

    const created = await service.createIngredient(tenantId, {
      name: `NoOpening-${randomUUID().slice(0, 8)}`,
      unit: 'kg',
    });

    expect(Number(created.current_stock)).toBe(0);
    const { data: movements } = await db
      .from('stock_movements')
      .select('id')
      .eq('ingredient_id', created.id);
    expect(movements ?? []).toHaveLength(0);
  });
});
