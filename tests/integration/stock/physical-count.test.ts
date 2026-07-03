/**
 * Integration tests for physical stock count (phase 4) against a real local
 * Postgres. Verifies migration 20260703000000: open_stock_count snapshots
 * theoretical stock, save_stock_count_lines records counts, commit_stock_count
 * applies the LIVE delta as physical_count ledger movements (reconcilable) and
 * flips menu availability, cancel_stock_count releases a session, plus the
 * one-open-per-tenant guard and tenant isolation. Driven by `pnpm test:db`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { journeyEnv } from '../../journeys/fixtures/env';

const ANON_KEY = process.env.JOURNEY_SUPABASE_ANON_KEY || '';
const SLUG = 'physical-count-test';
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
      current_stock: stock,
      min_stock_alert: 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  return data.id;
}

async function seedMenuItemWithRecipe(ingredientId: string): Promise<string> {
  const { data: item, error: iErr } = await db
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
  if (iErr || !item) throw new Error(`seed menu_item: ${iErr?.message}`);
  const { error: rErr } = await db.from('recipes').insert({
    tenant_id: tenantId,
    menu_item_id: item.id,
    ingredient_id: ingredientId,
    quantity_needed: 1,
  });
  if (rErr) throw new Error(`seed recipe: ${rErr.message}`);
  return item.id;
}

async function currentStock(ingredientId: string): Promise<number> {
  const { data } = await db
    .from('ingredients')
    .select('current_stock')
    .eq('id', ingredientId)
    .single();
  return Number(data?.current_stock);
}

async function isAvailable(menuItemId: string): Promise<boolean> {
  const { data } = await db.from('menu_items').select('is_available').eq('id', menuItemId).single();
  return Boolean(data?.is_available);
}

async function movementsFor(ingredientId: string) {
  const { data } = await db
    .from('stock_movements')
    .select('movement_type, quantity, reference_id')
    .eq('tenant_id', tenantId)
    .eq('ingredient_id', ingredientId);
  return data ?? [];
}

// Cancel any open session so each test starts clean (one-open-per-tenant guard).
async function releaseOpen(): Promise<void> {
  const { data } = await db
    .from('stock_counts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'open');
  for (const row of data ?? []) {
    await db.rpc('cancel_stock_count', { p_tenant_id: tenantId, p_count_id: row.id });
  }
}

beforeAll(async () => {
  await teardownTenantBySlug(SLUG);
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ slug: SLUG, name: 'Physical Count', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;
  const { data: menu } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'M', slug: 'm-pc' })
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
  await teardownTenantBySlug(`${SLUG}-b`);
});

describe('open_stock_count', () => {
  it('snapshots theoretical_qty for every active ingredient, counted NULL', async () => {
    await releaseOpen();
    const ingA = await seedIngredient(12);
    const ingB = await seedIngredient(5);
    const { data: countId, error } = await db.rpc('open_stock_count', {
      p_tenant_id: tenantId,
      p_reference: 'Inventaire matin',
    });
    expect(error).toBeNull();
    expect(countId).toBeTruthy();

    const { data: lines } = await db
      .from('stock_count_lines')
      .select('ingredient_id, theoretical_qty, counted_qty')
      .eq('count_id', countId);
    const byIng = new Map((lines ?? []).map((l) => [l.ingredient_id, l]));
    expect(Number(byIng.get(ingA)?.theoretical_qty)).toBe(12);
    expect(Number(byIng.get(ingB)?.theoretical_qty)).toBe(5);
    expect(byIng.get(ingA)?.counted_qty).toBeNull();
  });

  it('with a subset p_ingredient_ids only snapshots those ingredients', async () => {
    await releaseOpen();
    const only = await seedIngredient(3);
    await seedIngredient(9); // not passed
    const { data: countId } = await db.rpc('open_stock_count', {
      p_tenant_id: tenantId,
      p_ingredient_ids: [only],
    });
    const { data: lines } = await db
      .from('stock_count_lines')
      .select('ingredient_id')
      .eq('count_id', countId);
    expect((lines ?? []).length).toBe(1);
    expect(lines![0].ingredient_id).toBe(only);
  });

  it('raises OPEN_COUNT_EXISTS when a session is already open', async () => {
    await releaseOpen();
    await seedIngredient(1);
    await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    const { error } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    expect(error?.message).toMatch(/OPEN_COUNT_EXISTS/);
  });
});

describe('save_stock_count_lines', () => {
  it('sets counted_qty, then rejects negative and post-commit writes', async () => {
    await releaseOpen();
    const ing = await seedIngredient(10);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });

    const { error: saveErr } = await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 8 }],
    });
    expect(saveErr).toBeNull();

    const { error: negErr } = await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: -1 }],
    });
    expect(negErr?.message).toMatch(/INVALID_COUNTED_QTY/);

    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: countId });
    const { error: closedErr } = await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 5 }],
    });
    expect(closedErr?.message).toMatch(/COUNT_NOT_OPEN/);
  });
});

describe('commit_stock_count', () => {
  it('books a physical_count movement for the delta and reconciles the ledger', async () => {
    await releaseOpen();
    const ing = await seedIngredient(10);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 7 }],
    });
    const { data: n } = await db.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: countId,
    });
    expect(Number(n)).toBe(1);
    expect(await currentStock(ing)).toBe(7);

    const movs = await movementsFor(ing);
    const pc = movs.filter((m) => m.movement_type === 'physical_count');
    expect(pc.length).toBe(1);
    expect(Number(pc[0].quantity)).toBe(-3);
    expect(pc[0].reference_id).toBe(countId);
    // Ledger invariant: SUM of movements == current_stock (opening + this count).
    const sum = movs.reduce((acc, m) => acc + Number(m.quantity), 0);
    // No opening movement here (seed set current_stock directly), so SUM == delta.
    expect(sum).toBe(-3);
  });

  it('positive variance raises stock and books a positive movement', async () => {
    await releaseOpen();
    const ing = await seedIngredient(4);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 9 }],
    });
    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: countId });
    expect(await currentStock(ing)).toBe(9);
    const pc = (await movementsFor(ing)).filter((m) => m.movement_type === 'physical_count');
    expect(Number(pc[0].quantity)).toBe(5);
  });

  it('no-variance line books no movement but still commits', async () => {
    await releaseOpen();
    const ing = await seedIngredient(6);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 6 }],
    });
    const { data: n } = await db.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: countId,
    });
    expect(Number(n)).toBe(0);
    const pc = (await movementsFor(ing)).filter((m) => m.movement_type === 'physical_count');
    expect(pc.length).toBe(0);
    const { data: count } = await db
      .from('stock_counts')
      .select('status')
      .eq('id', countId)
      .single();
    expect(count?.status).toBe('committed');
  });

  it('computes the delta against LIVE stock, not the open-time snapshot', async () => {
    await releaseOpen();
    const ing = await seedIngredient(10);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    // Stock moves after the snapshot (theoretical was 10).
    await db.from('ingredients').update({ current_stock: 8 }).eq('id', ing);
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 7 }],
    });
    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: countId });
    expect(await currentStock(ing)).toBe(7);
    // Delta = counted(7) - LIVE(8) = -1, not counted - snapshot(10) = -3.
    const pc = (await movementsFor(ing)).filter((m) => m.movement_type === 'physical_count');
    expect(Number(pc[0].quantity)).toBe(-1);
  });

  it('is idempotent: a second commit raises COUNT_ALREADY_CLOSED', async () => {
    await releaseOpen();
    const ing = await seedIngredient(10);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: countId,
      p_lines: [{ ingredient_id: ing, counted_qty: 3 }],
    });
    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: countId });
    const { error } = await db.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: countId,
    });
    expect(error?.message).toMatch(/COUNT_ALREADY_CLOSED/);
    const pc = (await movementsFor(ing)).filter((m) => m.movement_type === 'physical_count');
    expect(pc.length).toBe(1); // no duplicate
  });

  it('flips menu availability on a zero count and back on a positive recount', async () => {
    await releaseOpen();
    const ing = await seedIngredient(5);
    const item = await seedMenuItemWithRecipe(ing);
    expect(await isAvailable(item)).toBe(true);

    // Count it to 0 -> item unavailable.
    const { data: c1 } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: c1,
      p_lines: [{ ingredient_id: ing, counted_qty: 0 }],
    });
    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: c1 });
    expect(await isAvailable(item)).toBe(false);

    // Recount to 4 -> item available again.
    const { data: c2 } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('save_stock_count_lines', {
      p_tenant_id: tenantId,
      p_count_id: c2,
      p_lines: [{ ingredient_id: ing, counted_qty: 4 }],
    });
    await db.rpc('commit_stock_count', { p_tenant_id: tenantId, p_count_id: c2 });
    expect(await isAvailable(item)).toBe(true);
  });
});

describe('cancel_stock_count', () => {
  it('cancels an open session and blocks a later commit', async () => {
    await releaseOpen();
    await seedIngredient(2);
    const { data: countId } = await db.rpc('open_stock_count', { p_tenant_id: tenantId });
    await db.rpc('cancel_stock_count', { p_tenant_id: tenantId, p_count_id: countId });
    const { data: count } = await db
      .from('stock_counts')
      .select('status')
      .eq('id', countId)
      .single();
    expect(count?.status).toBe('cancelled');
    const { error } = await db.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: countId,
    });
    expect(error?.message).toMatch(/COUNT_ALREADY_CLOSED/);
  });
});

describe('tenant isolation', () => {
  it('rejects open/commit for a non-member (assert_tenant_member)', async () => {
    if (!ANON_KEY) return; // needs the anon key (exported by the test:db runner)
    const email = `pc-outsider-${randomUUID().slice(0, 8)}@test.local`;
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

    const open = await outsider.rpc('open_stock_count', { p_tenant_id: tenantId });
    expect(open.error?.message).toMatch(/access denied|not a member/i);
    const commit = await outsider.rpc('commit_stock_count', {
      p_tenant_id: tenantId,
      p_count_id: randomUUID(),
    });
    expect(commit.error?.message).toMatch(/access denied|not a member/i);
  });
});
