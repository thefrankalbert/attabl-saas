/**
 * Integration tests for the structured-loss RPCs against a REAL local Postgres.
 *
 * The unit suite mocks supabase.rpc, so the load-bearing SQL - clamp-at-0,
 * reconcilable 'loss' movement carrying reason_code, auto-unavailable flip, the
 * reason_code CHECK, and tenant scoping - is never executed. These tests close
 * that gap by calling record_loss_tx / get_losses_by_reason for real.
 *
 * Driven by `pnpm test:db` (scripts/run-stock-integration.sh).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';

const SLUG = 'stock-losses-test';
const db = getAdmin();

let tenantId: string;
let categoryId: string;

async function seedIngredient(opts: {
  unit?: string;
  cost?: number;
  name?: string;
}): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: opts.name ?? `Ing-${randomUUID().slice(0, 8)}`,
      unit: opts.unit ?? 'kg',
      cost_per_unit: opts.cost ?? 0,
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

async function seedRecipe(menuItemId: string, ingredientId: string, quantityNeeded: number) {
  const { error } = await db.from('recipes').insert({
    tenant_id: tenantId,
    menu_item_id: menuItemId,
    ingredient_id: ingredientId,
    quantity_needed: quantityNeeded,
  });
  if (error) throw new Error(`seed recipe: ${error.message}`);
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

/** SUM of signed movement quantities for an ingredient (ledger sum). */
async function movementSum(ingredientId: string): Promise<number> {
  const { data, error } = await db
    .from('stock_movements')
    .select('quantity')
    .eq('ingredient_id', ingredientId);
  if (error) throw new Error(`sum movements: ${error.message}`);
  return (data ?? []).reduce((s, m) => s + Number(m.quantity), 0);
}

async function lastLossMovement(
  ingredientId: string,
): Promise<{ quantity: number; reason_code: string | null } | null> {
  const { data, error } = await db
    .from('stock_movements')
    .select('quantity, reason_code')
    .eq('ingredient_id', ingredientId)
    .eq('movement_type', 'loss')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read loss movement: ${error.message}`);
  return data ? { quantity: Number(data.quantity), reason_code: data.reason_code } : null;
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Stock Losses', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'Menu IT', slug: 'menu-losses' })
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

describe('record_loss_tx / get_losses_by_reason (real Postgres)', () => {
  it('decrements by exact qty, writes a negative loss movement carrying reason_code, ledger reconciles', async () => {
    const ing = await seedIngredient({});
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 10,
    });

    const { data: after, error } = await db.rpc('record_loss_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 3,
      p_reason_code: 'breakage',
    });
    expect(error).toBeNull();
    expect(Number(after)).toBeCloseTo(7, 3);
    expect(await getStock(ing)).toBeCloseTo(7, 3);

    const loss = await lastLossMovement(ing);
    expect(loss?.quantity).toBeCloseTo(-3, 3);
    expect(loss?.reason_code).toBe('breakage');

    // Ledger reconciles: opening(+10) + loss(-3) = 7 = current_stock.
    expect(await movementSum(ing)).toBeCloseTo(7, 3);
    expect(await movementSum(ing)).toBeCloseTo(await getStock(ing), 3);
  });

  it('clamps at 0 when the loss exceeds stock and records the ACTUAL applied delta', async () => {
    const ing = await seedIngredient({});
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 4,
    });

    const { data: after, error } = await db.rpc('record_loss_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 9, // more than the 4 on hand
      p_reason_code: 'spillage',
    });
    expect(error).toBeNull();
    expect(Number(after)).toBeCloseTo(0, 3);
    expect(await getStock(ing)).toBeCloseTo(0, 3);

    const loss = await lastLossMovement(ing);
    expect(loss?.quantity).toBeCloseTo(-4, 3); // applied delta, not -9
    expect(await movementSum(ing)).toBeCloseTo(0, 3); // never negative
  });

  it('auto-disables dependent menu items when the ingredient hits 0', async () => {
    const ing = await seedIngredient({});
    const item = await seedMenuItem();
    await seedRecipe(item, ing, 1);
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 2,
    });
    expect(await getIsAvailable(item)).toBe(true);

    await db.rpc('record_loss_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 2,
      p_reason_code: 'expired',
    });
    expect(await getStock(ing)).toBeCloseTo(0, 3);
    expect(await getIsAvailable(item)).toBe(false);
  });

  it('rejects a non-positive quantity (INVALID_QUANTITY)', async () => {
    const ing = await seedIngredient({});
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 5,
    });

    const { error } = await db.rpc('record_loss_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 0,
      p_reason_code: 'other',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('INVALID_QUANTITY');
    expect(await getStock(ing)).toBeCloseTo(5, 3); // untouched
  });

  it('rejects an unknown reason via INVALID_REASON', async () => {
    const ing = await seedIngredient({});
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 5,
    });

    const { error } = await db.rpc('record_loss_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 1,
      p_reason_code: 'not_a_reason',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('INVALID_REASON');
  });

  it('a direct loss INSERT with a bad reason_code is rejected by the CHECK', async () => {
    const ing = await seedIngredient({});
    const { error } = await db.from('stock_movements').insert({
      tenant_id: tenantId,
      ingredient_id: ing,
      movement_type: 'loss',
      quantity: -1,
      reason_code: 'totally_invalid',
    });
    expect(error).not.toBeNull(); // stock_movements_reason_code_check
  });

  it('record_loss_tx for an ingredient of another tenant -> INGREDIENT_NOT_FOUND', async () => {
    const ing = await seedIngredient({});
    await db.rpc('set_opening_stock', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing,
      p_quantity: 5,
    });

    const foreignTenant = randomUUID();
    const { error } = await db.rpc('record_loss_tx', {
      p_tenant_id: foreignTenant,
      p_ingredient_id: ing,
      p_quantity: 1,
      p_reason_code: 'theft',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('INGREDIENT_NOT_FOUND');
    expect(await getStock(ing)).toBeCloseTo(5, 3); // untouched
  });

  it('get_losses_by_reason aggregates per reason, valued by cost_per_unit, tenant-scoped', async () => {
    // Fresh isolated tenant to make the aggregation deterministic.
    const slug = `stock-losses-agg-${randomUUID().slice(0, 8)}`;
    await teardownTenantBySlug(slug);
    const { data: t2 } = await db
      .from('tenants')
      .insert({ slug, name: 'Losses Agg', is_active: true })
      .select('id')
      .single();
    const aggTenant = t2!.id;
    try {
      const { data: ingRow } = await db
        .from('ingredients')
        .insert({ tenant_id: aggTenant, name: 'Farine', unit: 'kg', cost_per_unit: 100 })
        .select('id')
        .single();
      const ingA = ingRow!.id;
      await db.rpc('set_opening_stock', {
        p_tenant_id: aggTenant,
        p_ingredient_id: ingA,
        p_quantity: 100,
      });

      // 2 breakage (2 + 3 = 5 qty) and 1 theft (4 qty).
      await db.rpc('record_loss_tx', {
        p_tenant_id: aggTenant,
        p_ingredient_id: ingA,
        p_quantity: 2,
        p_reason_code: 'breakage',
      });
      await db.rpc('record_loss_tx', {
        p_tenant_id: aggTenant,
        p_ingredient_id: ingA,
        p_quantity: 3,
        p_reason_code: 'breakage',
      });
      await db.rpc('record_loss_tx', {
        p_tenant_id: aggTenant,
        p_ingredient_id: ingA,
        p_quantity: 4,
        p_reason_code: 'theft',
      });

      const { data, error } = await db.rpc('get_losses_by_reason', { p_tenant_id: aggTenant });
      expect(error).toBeNull();
      const rows = data as {
        reason_code: string;
        nb_movements: number;
        total_qty: number;
        total_cost_value: number;
      }[];

      const breakage = rows.find((r) => r.reason_code === 'breakage');
      const theft = rows.find((r) => r.reason_code === 'theft');
      expect(Number(breakage?.nb_movements)).toBe(2);
      expect(Number(breakage?.total_qty)).toBeCloseTo(5, 3);
      expect(Number(breakage?.total_cost_value)).toBeCloseTo(500, 3); // 5 * 100
      expect(Number(theft?.nb_movements)).toBe(1);
      expect(Number(theft?.total_qty)).toBeCloseTo(4, 3);
      expect(Number(theft?.total_cost_value)).toBeCloseTo(400, 3);

      // Tenant scoping: the main tenant's losses never leak into this report.
      expect(rows.every((r) => r.reason_code === 'breakage' || r.reason_code === 'theft')).toBe(
        true,
      );

      // Window filter: a future start yields no rows.
      const { data: windowed } = await db.rpc('get_losses_by_reason', {
        p_tenant_id: aggTenant,
        p_start: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect((windowed as unknown[]).length).toBe(0);
    } finally {
      await teardownTenantBySlug(slug);
    }
  });
});
