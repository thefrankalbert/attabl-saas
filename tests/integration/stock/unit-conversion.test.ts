/**
 * Integration tests for chantier #15 (unit conversion) against a real local
 * Postgres. Verifies the additive migration 20260703180000: the two new
 * ingredients columns (purchase_unit, units_per_purchase) with their defaults,
 * the units_per_purchase > 0 CHECK, a purchase-config round-trip, that the
 * untouched get_stock_status RPC still works with the new columns present, and
 * that the ledger stays in base unit (conversion happens in TS before the RPC,
 * so adjust_ingredient_stock_tx sees only a base-unit delta). Driven by
 * `pnpm test:db`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';

const SLUG = 'unit-conversion-test';
const db = getAdmin();
let tenantId: string;

async function seedIngredient(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: `Ing-${randomUUID().slice(0, 8)}`,
      unit: 'bouteille',
      min_stock_alert: 0,
      ...overrides,
    })
    .select('id, unit, purchase_unit, units_per_purchase, current_stock')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  return data;
}

async function getStock(ingredientId: string): Promise<number> {
  const { data } = await db
    .from('ingredients')
    .select('current_stock')
    .eq('id', ingredientId)
    .single();
  return Number(data?.current_stock);
}

async function movementsFor(ingredientId: string) {
  const { data, error } = await db
    .from('stock_movements')
    .select('movement_type, quantity')
    .eq('tenant_id', tenantId)
    .eq('ingredient_id', ingredientId);
  if (error) throw new Error(`movements: ${error.message}`);
  return data ?? [];
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Unit Conversion', is_active: true })
    .select('id')
    .single();
  if (error || !tenant) throw new Error(`seed tenant: ${error?.message}`);
  tenantId = tenant.id;
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
});

describe('ingredient purchase-unit conversion (real Postgres)', () => {
  it('new columns exist with defaults NULL / 1 for a freshly seeded ingredient', async () => {
    const ing = await seedIngredient();
    expect(ing.purchase_unit).toBeNull();
    expect(Number(ing.units_per_purchase)).toBe(1);
  });

  it('CHECK rejects units_per_purchase = 0 and = -5', async () => {
    const zero = await db
      .from('ingredients')
      .insert({
        tenant_id: tenantId,
        name: `Bad-${randomUUID().slice(0, 8)}`,
        unit: 'kg',
        units_per_purchase: 0,
      })
      .select('id');
    expect(zero.error).not.toBeNull();

    const negative = await db
      .from('ingredients')
      .insert({
        tenant_id: tenantId,
        name: `Bad-${randomUUID().slice(0, 8)}`,
        unit: 'kg',
        units_per_purchase: -5,
      })
      .select('id');
    expect(negative.error).not.toBeNull();
  });

  it('round-trips a purchase config (casier / 24) via service_role', async () => {
    const ing = await seedIngredient({ purchase_unit: 'casier', units_per_purchase: 24 });
    expect(ing.purchase_unit).toBe('casier');
    expect(Number(ing.units_per_purchase)).toBe(24);

    const { data } = await db
      .from('ingredients')
      .select('purchase_unit, units_per_purchase')
      .eq('id', ing.id as string)
      .single();
    expect(data?.purchase_unit).toBe('casier');
    expect(Number(data?.units_per_purchase)).toBe(24);
  });

  it('get_stock_status still works after the migration', async () => {
    await seedIngredient({ purchase_unit: 'casier', units_per_purchase: 24 });
    const { data, error } = await db.rpc('get_stock_status', { p_tenant_id: tenantId });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Shape unchanged: rows carry the base-unit current_stock, no purchase columns.
    if ((data as unknown[]).length > 0) {
      const row = (data as Record<string, unknown>[])[0];
      expect(row).toHaveProperty('current_stock');
      expect(row).not.toHaveProperty('purchase_unit');
    }
  });

  it('ledger stays base-unit: a pre-converted base delta (48) records ONE manual_add of +48', async () => {
    // Ingredient bought by the casier (24 bouteille). The TS helper converts
    // 2 casier -> 48 bouteille BEFORE the RPC, so the ledger only ever sees the
    // base-unit delta. Emulate that here by passing the converted 48 directly.
    const ing = await seedIngredient({ purchase_unit: 'casier', units_per_purchase: 24 });

    const { error } = await db.rpc('adjust_ingredient_stock_tx', {
      p_tenant_id: tenantId,
      p_ingredient_id: ing.id as string,
      p_delta: 48,
      p_movement_type: 'manual_add',
      p_notes: 'Recu: 2 casier (48 bouteille)',
    });
    expect(error).toBeNull();

    expect(await getStock(ing.id as string)).toBe(48);

    const movs = await movementsFor(ing.id as string);
    const adds = movs.filter((m) => m.movement_type === 'manual_add');
    expect(adds).toHaveLength(1);
    expect(Number(adds[0].quantity)).toBe(48);
    // Ledger invariant: SUM(movements) == current_stock, no unit awareness.
    const sum = movs.reduce((acc, m) => acc + Number(m.quantity), 0);
    expect(sum).toBeCloseTo(await getStock(ing.id as string), 3);
  });
});
