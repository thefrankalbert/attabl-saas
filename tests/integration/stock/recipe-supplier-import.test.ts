/**
 * Integration tests for the Excel import layer (#11) against a real local
 * Postgres. Covers:
 *  - the import_recipes_tx RPC (migration 20260703190000): get-or-create of
 *    ingredients, ON CONFLICT merge of recipe lines, case-insensitive reuse,
 *    tenant scoping / MENU_ITEM_NOT_FOUND, assert_tenant_member, and the
 *    all-or-nothing rollback on a bad row.
 *  - the supplier import service against the real suppliers table (insert +
 *    update by lower(name), tenant isolation).
 *  - the recipe import service end-to-end (parse -> pre-filter -> real RPC).
 *
 * Driven by `pnpm test:db` (scripts/run-stock-integration.sh).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { journeyEnv } from '../../journeys/fixtures/env';
import { createSupplierImportService } from '../../../src/services/supplier-import.service';
import { createRecipeImportService } from '../../../src/services/recipe-import.service';

const ANON_KEY = process.env.JOURNEY_SUPABASE_ANON_KEY || '';
const SLUG = 'recipe-import-test';
const SLUG_B = 'recipe-import-test-b';
const db = getAdmin();

let tenantId: string;
let tenantBId: string;
let categoryId: string;
let categoryBId: string;

function buildXlsx(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

async function seedMenuItem(name: string, tid: string = tenantId): Promise<string> {
  const { data, error } = await db
    .from('menu_items')
    .insert({
      tenant_id: tid,
      category_id: tid === tenantId ? categoryId : categoryBId,
      name,
      price: 2500,
      is_available: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed menu_item: ${error?.message}`);
  return data.id;
}

async function ingredientByName(name: string): Promise<{ id: string; unit: string } | null> {
  const { data } = await db
    .from('ingredients')
    .select('id, unit')
    .eq('tenant_id', tenantId)
    .ilike('name', name)
    .maybeSingle();
  return data ?? null;
}

async function recipeLine(
  menuItemId: string,
  ingredientId: string,
): Promise<{ quantity_needed: number; notes: string | null } | null> {
  const { data } = await db
    .from('recipes')
    .select('quantity_needed, notes')
    .eq('menu_item_id', menuItemId)
    .eq('ingredient_id', ingredientId)
    .maybeSingle();
  return data ? { quantity_needed: Number(data.quantity_needed), notes: data.notes } : null;
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  await teardownTenantBySlug(SLUG_B);

  const { data: tenant, error } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Recipe Import', is_active: true })
    .select('id')
    .single();
  if (error || !tenant) throw new Error(`seed tenant: ${error?.message}`);
  tenantId = tenant.id;

  const { data: tenantB, error: bErr } = await db
    .from('tenants')
    .insert({ slug: SLUG_B, name: 'Recipe Import B', is_active: true })
    .select('id')
    .single();
  if (bErr || !tenantB) throw new Error(`seed tenant B: ${bErr?.message}`);
  tenantBId = tenantB.id;

  const { data: menu, error: mErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'Menu', slug: 'menu-ri' })
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

  const { data: menuB, error: mbErr } = await db
    .from('menus')
    .insert({ tenant_id: tenantBId, name: 'Menu B', slug: 'menu-ri-b' })
    .select('id')
    .single();
  if (mbErr || !menuB) throw new Error(`seed menu B: ${mbErr?.message}`);

  const { data: categoryB, error: cbErr } = await db
    .from('categories')
    .insert({ tenant_id: tenantBId, menu_id: menuB.id, name: 'Plats B' })
    .select('id')
    .single();
  if (cbErr || !categoryB) throw new Error(`seed category B: ${cbErr?.message}`);
  categoryBId = categoryB.id;
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
  await teardownTenantBySlug(SLUG_B);
});

describe('import_recipes_tx RPC (real Postgres)', () => {
  it('creates a missing ingredient and inserts the recipe line', async () => {
    const item = await seedMenuItem(`Dish-${randomUUID().slice(0, 6)}`);
    const ingName = `Tomate-${randomUUID().slice(0, 6)}`;

    const { data, error } = await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: item,
          ingredient_name: ingName,
          unit: 'kg',
          quantity_needed: 0.5,
          notes: 'frais',
        },
      ],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ recipes_created: 1, recipes_updated: 0, ingredients_created: 1 });

    const ing = await ingredientByName(ingName);
    expect(ing).not.toBeNull();
    const line = await recipeLine(item, ing!.id);
    expect(line?.quantity_needed).toBeCloseTo(0.5, 3);
    expect(line?.notes).toBe('frais');
  });

  it('ON CONFLICT updates quantity_needed and notes (recipes_updated)', async () => {
    const item = await seedMenuItem(`Dish-${randomUUID().slice(0, 6)}`);
    const ingName = `Oignon-${randomUUID().slice(0, 6)}`;

    await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: item,
          ingredient_name: ingName,
          unit: 'kg',
          quantity_needed: 0.2,
          notes: 'a',
        },
      ],
    });
    const { data } = await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: item,
          ingredient_name: ingName,
          unit: 'kg',
          quantity_needed: 0.9,
          notes: 'b',
        },
      ],
    });
    expect(data).toMatchObject({ recipes_created: 0, recipes_updated: 1, ingredients_created: 0 });

    const ing = await ingredientByName(ingName);
    const line = await recipeLine(item, ing!.id);
    expect(line?.quantity_needed).toBeCloseTo(0.9, 3);
    expect(line?.notes).toBe('b');
  });

  it('reuses an existing ingredient case-insensitively (no dupe)', async () => {
    const item = await seedMenuItem(`Dish-${randomUUID().slice(0, 6)}`);
    const base = `Sel-${randomUUID().slice(0, 6)}`;
    await db
      .from('ingredients')
      .insert({ tenant_id: tenantId, name: base.toLowerCase(), unit: 'g' });

    const { data } = await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: item,
          ingredient_name: base.toUpperCase(),
          unit: 'g',
          quantity_needed: 5,
          notes: null,
        },
      ],
    });
    expect(data).toMatchObject({ ingredients_created: 0, recipes_created: 1 });

    const { data: rows } = await db
      .from('ingredients')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', base);
    expect((rows ?? []).length).toBe(1);
  });

  it('rejects a foreign-tenant menu_item (MENU_ITEM_NOT_FOUND) and rolls back the whole call', async () => {
    const foreignItem = await seedMenuItem(`Dish-B-${randomUUID().slice(0, 6)}`, tenantBId);
    const okItem = await seedMenuItem(`Dish-${randomUUID().slice(0, 6)}`);
    const newIng = `Curcuma-${randomUUID().slice(0, 6)}`;

    const { error } = await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: okItem,
          ingredient_name: newIng,
          unit: 'g',
          quantity_needed: 3,
          notes: null,
        },
        {
          menu_item_id: foreignItem,
          ingredient_name: 'X',
          unit: 'g',
          quantity_needed: 1,
          notes: null,
        },
      ],
    });
    expect(error?.message).toMatch(/MENU_ITEM_NOT_FOUND/);
    // Atomic: the ingredient from the first (clean) row must NOT have been created.
    expect(await ingredientByName(newIng)).toBeNull();
  });

  it('rolls back the whole call when one row has an invalid quantity', async () => {
    const item = await seedMenuItem(`Dish-${randomUUID().slice(0, 6)}`);
    const newIng = `Basilic-${randomUUID().slice(0, 6)}`;
    const { error } = await db.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        { menu_item_id: item, ingredient_name: newIng, unit: 'g', quantity_needed: 4, notes: null },
        {
          menu_item_id: item,
          ingredient_name: 'Poivre',
          unit: 'g',
          quantity_needed: 0,
          notes: null,
        },
      ],
    });
    expect(error?.message).toMatch(/INVALID_QUANTITY/);
    expect(await ingredientByName(newIng)).toBeNull();
  });

  it('raises for a non-member caller (assert_tenant_member)', async () => {
    if (!ANON_KEY) return; // needs the anon key exported by the runner
    const email = `ri-outsider-${randomUUID().slice(0, 8)}@test.local`;
    const password = 'Outsider-Passw0rd!';
    const outsider = createClient(journeyEnv.supabaseUrl, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signUp = await outsider.auth.signUp({ email, password });
    expect(signUp.error).toBeNull();
    if (!signUp.data.session) {
      const signIn = await outsider.auth.signInWithPassword({ email, password });
      expect(signIn.error).toBeNull();
    }

    const res = await outsider.rpc('import_recipes_tx', {
      p_tenant_id: tenantId,
      p_rows: [
        {
          menu_item_id: randomUUID(),
          ingredient_name: 'X',
          unit: 'g',
          quantity_needed: 1,
          notes: null,
        },
      ],
    });
    expect(res.error?.message).toMatch(/access denied|not a member/i);
  });
});

describe('supplier import service (real DB)', () => {
  it('inserts new suppliers and updates existing by lower(name); isolates tenant B', async () => {
    const svc = createSupplierImportService(db);
    const existingName = `Fournisseur-${randomUUID().slice(0, 6)}`;
    await db.from('suppliers').insert({ tenant_id: tenantId, name: existingName });
    // A same-named supplier in tenant B must never be touched.
    await db.from('suppliers').insert({ tenant_id: tenantBId, name: existingName });

    const newName = `Nouveau-${randomUUID().slice(0, 6)}`;
    const buffer = buildXlsx([
      ['Name', 'Phone', 'Email'],
      [existingName.toLowerCase(), '+225 99', 'up@x.ci'], // update (case-insensitive)
      [newName, '+225 88', 'new@x.ci'], // insert
    ]);

    const result = await svc.importFromExcel(tenantId, buffer);
    expect(result.suppliersUpdated).toBe(1);
    expect(result.suppliersCreated).toBe(1);
    expect(result.errors).toHaveLength(0);

    const { data: updated } = await db
      .from('suppliers')
      .select('phone')
      .eq('tenant_id', tenantId)
      .ilike('name', existingName)
      .single();
    expect(updated?.phone).toBe('+225 99');

    // Tenant B row untouched.
    const { data: bRow } = await db
      .from('suppliers')
      .select('phone')
      .eq('tenant_id', tenantBId)
      .ilike('name', existingName)
      .single();
    expect(bRow?.phone).toBeNull();
  });
});

describe('recipe import service end-to-end (real RPC)', () => {
  it('imports a 3-line sheet for one dish, then re-imports with a changed qty (update, no dupe)', async () => {
    const dish = `Poulet-${randomUUID().slice(0, 6)}`;
    const item = await seedMenuItem(dish);
    const svc = createRecipeImportService(db);

    const first = await svc.importFromExcel(
      tenantId,
      buildXlsx([
        ['Dish', 'Ingredient', 'Unit', 'Quantity', 'Notes'],
        [dish, `Poulet-${dish}`, 'kg', 0.3, ''],
        [dish, `Plantain-${dish}`, 'kg', 0.2, ''],
        [dish, `Huile-${dish}`, 'cl', 5, ''],
      ]),
    );
    expect(first.recipesCreated).toBe(3);
    expect(first.ingredientsCreated).toBe(3);
    expect(first.errors).toHaveLength(0);

    const second = await svc.importFromExcel(
      tenantId,
      buildXlsx([
        ['Dish', 'Ingredient', 'Unit', 'Quantity', 'Notes'],
        [dish, `Poulet-${dish}`, 'kg', 0.45, 'plus'],
      ]),
    );
    expect(second.recipesUpdated).toBe(1);
    expect(second.recipesCreated).toBe(0);
    expect(second.ingredientsCreated).toBe(0);

    const { data: lines } = await db.from('recipes').select('id').eq('menu_item_id', item);
    expect((lines ?? []).length).toBe(3); // merge, not duplicate
  });
});
