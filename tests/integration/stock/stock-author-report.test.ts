/**
 * Integration tests for the author + staff report RPCs (phase 3).
 * Verifies migration 20260702140000:
 *   - get_stock_movements_page returns author_name from admin_users
 *   - get_staff_stock_report aggregates correctly by operator
 *   - query tenant-scoping isolates rows + author names across tenants
 *     (the assert_tenant_member guard itself is bypassed by the service_role
 *     harness client, so it is covered by the BOLA journey tests, not here)
 *
 * Driven by `pnpm test:db` (scripts/run-stock-integration.sh).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { journeyEnv } from '../../journeys/fixtures/env';

// admin_users.user_id has a FK to auth.users, so a synthetic uuid is rejected.
// Create a REAL auth user via the GoTrue /signup endpoint (anon key - the admin
// API rejects the local sb_secret_ service key). Runner exports the anon key.
const ANON_KEY = process.env.JOURNEY_SUPABASE_ANON_KEY || '';

async function createAuthUser(): Promise<string> {
  const email = `author-report-${randomUUID().slice(0, 8)}@test.local`;
  const password = 'Author-Passw0rd!';
  const anon = createClient(journeyEnv.supabaseUrl, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error || !data.user) throw new Error(`createAuthUser: ${error?.message}`);
  return data.user.id;
}

// Mock logger to avoid Sentry in test context
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SLUG = 'author-report-test';
const SLUG_B = 'author-report-test-b';
const db = getAdmin();

let tenantId: string;
let adminUserId: string;

async function seedIngredient(name?: string): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({
      tenant_id: tenantId,
      name: name ?? `Ing-${randomUUID().slice(0, 8)}`,
      unit: 'kg',
      min_stock_alert: 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  return data.id;
}

async function seedMovement(
  ingredientId: string,
  quantity: number,
  movementType = 'manual_add',
  createdBy?: string,
): Promise<void> {
  const { error } = await db.from('stock_movements').insert({
    tenant_id: tenantId,
    ingredient_id: ingredientId,
    movement_type: movementType,
    quantity,
    created_by: createdBy ?? null,
  });
  if (error) throw new Error(`seed movement: ${error.message}`);
}

beforeAll(async () => {
  // Create test tenant
  const { data: tenant, error: tenantErr } = await db
    .from('tenants')
    .insert({ name: 'Author Report Test', slug: SLUG })
    .select('id')
    .single();
  if (tenantErr || !tenant) throw new Error(`tenant: ${tenantErr?.message}`);
  tenantId = tenant.id;

  // Real auth user (FK admin_users.user_id -> auth.users) for the author lookup.
  const realUserId = await createAuthUser();
  const { error: auErr } = await db.from('admin_users').insert({
    user_id: realUserId,
    tenant_id: tenantId,
    email: `author-report-${realUserId.slice(0, 8)}@test.local`,
    full_name: 'Amadou Test',
    role: 'manager',
  });
  if (auErr) throw new Error(`admin_user: ${auErr.message}`);
  adminUserId = realUserId;

  // Seed some movements (attributed + unattributed)
  const ingId = await seedIngredient('Tomates');
  await seedMovement(ingId, 10, 'manual_add', adminUserId);
  await seedMovement(ingId, -3, 'manual_remove', adminUserId);
  await seedMovement(ingId, -1, 'order_destock'); // no author
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
  await teardownTenantBySlug(SLUG_B);
});

describe('get_stock_movements_page', () => {
  it('returns movements with author_name populated for attributed rows', async () => {
    const { data, error } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 50,
      p_offset: 0,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const attributed = (data as Record<string, unknown>[]).filter(
      (r) => r.created_by === adminUserId,
    );
    expect(attributed.length).toBeGreaterThan(0);
    for (const row of attributed) {
      expect(row.author_name).toBe('Amadou Test');
    }
  });

  it('returns null author_name for system movements without created_by', async () => {
    const { data } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 50,
      p_offset: 0,
    });

    const unattributed = (data as Record<string, unknown>[]).filter((r) => r.created_by == null);
    // Guard: the seeded order_destock row makes this non-vacuous.
    expect(unattributed.length).toBeGreaterThan(0);
    for (const row of unattributed) {
      expect(row.author_name).toBeNull();
    }
  });

  it('respects p_limit and p_offset for pagination', async () => {
    const { data: page1 } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 1,
      p_offset: 0,
    });
    const { data: page2 } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 1,
      p_offset: 1,
    });

    expect((page1 as unknown[]).length).toBe(1);
    expect((page2 as unknown[]).length).toBe(1);
    const ids1 = (page1 as Record<string, unknown>[]).map((r) => r.id);
    const ids2 = (page2 as Record<string, unknown>[]).map((r) => r.id);
    expect(ids1[0]).not.toBe(ids2[0]);
  });

  it('returns ingredient_name and ingredient_unit in flat columns', async () => {
    const { data } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 50,
      p_offset: 0,
    });

    const rows = data as Record<string, unknown>[];
    const withIngredient = rows.filter((r) => r.ingredient_name != null);
    expect(withIngredient.length).toBeGreaterThan(0);
    expect(typeof withIngredient[0].ingredient_name).toBe('string');
    expect(typeof withIngredient[0].ingredient_unit).toBe('string');
  });

  it('isolates tenants: excludes another tenant rows and never leaks its author name', async () => {
    // Tenant B where the SAME user is an admin under a DIFFERENT full_name. If the
    // author subquery were not tenant-scoped, tenant A rows would resolve B's name.
    const { data: tenantB, error: tbErr } = await db
      .from('tenants')
      .insert({ name: 'Author Report Test B', slug: SLUG_B })
      .select('id')
      .single();
    if (tbErr || !tenantB) throw new Error(`tenant B: ${tbErr?.message}`);
    const { error: auBErr } = await db.from('admin_users').insert({
      user_id: adminUserId,
      tenant_id: tenantB.id,
      email: `author-report-b-${adminUserId.slice(0, 8)}@test.local`,
      full_name: 'Impostor Name',
      role: 'manager',
    });
    if (auBErr) throw new Error(`admin_user B: ${auBErr.message}`);
    const { data: ingB } = await db
      .from('ingredients')
      .insert({ tenant_id: tenantB.id, name: 'B-ingredient', unit: 'kg', min_stock_alert: 0 })
      .select('id')
      .single();
    await db.from('stock_movements').insert({
      tenant_id: tenantB.id,
      ingredient_id: ingB!.id,
      movement_type: 'manual_add',
      quantity: 99,
      created_by: adminUserId,
    });

    const { data } = await db.rpc('get_stock_movements_page', {
      p_tenant_id: tenantId,
      p_limit: 200,
      p_offset: 0,
    });
    const rows = data as Record<string, unknown>[];
    // No tenant B row leaks into tenant A's feed.
    expect(rows.every((r) => r.tenant_id === tenantId)).toBe(true);
    // Tenant A rows by this user resolve A's name, never B's "Impostor Name".
    const attributed = rows.filter((r) => r.created_by === adminUserId);
    expect(attributed.length).toBeGreaterThan(0);
    expect(attributed.every((r) => r.author_name === 'Amadou Test')).toBe(true);
  });
});

describe('get_staff_stock_report', () => {
  const farPast = '2000-01-01T00:00:00Z';
  const farFuture = '2099-01-01T00:00:00Z';

  it('aggregates out_qty and in_qty correctly for the attributed user', async () => {
    const { data, error } = await db.rpc('get_staff_stock_report', {
      p_tenant_id: tenantId,
      p_start: farPast,
      p_end: farFuture,
    });

    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    const userRow = rows.find((r) => r.author_id === adminUserId);

    expect(userRow).toBeDefined();
    // 10 in, 3 out
    expect(Number(userRow!.in_qty)).toBe(10);
    expect(Number(userRow!.out_qty)).toBe(3);
    expect(Number(userRow!.movements_count)).toBe(2);
    expect(String(userRow!.author_name)).toBe('Amadou Test');
  });

  it('excludes unattributed movements (NULL created_by)', async () => {
    const { data } = await db.rpc('get_staff_stock_report', {
      p_tenant_id: tenantId,
      p_start: farPast,
      p_end: farFuture,
    });

    const rows = data as Record<string, unknown>[];
    const nullAuthorRow = rows.find((r) => r.author_id == null);
    // Unattributed movements should not appear (WHERE created_by IS NOT NULL)
    expect(nullAuthorRow).toBeUndefined();
  });

  it('respects date range: returns empty outside the window', async () => {
    const { data } = await db.rpc('get_staff_stock_report', {
      p_tenant_id: tenantId,
      p_start: '2000-01-01T00:00:00Z',
      p_end: '2000-01-02T00:00:00Z',
    });

    expect((data as unknown[]).length).toBe(0);
  });

  it('manual_remove_qty tracks manual removals correctly', async () => {
    const { data } = await db.rpc('get_staff_stock_report', {
      p_tenant_id: tenantId,
      p_start: farPast,
      p_end: farFuture,
    });

    const rows = data as Record<string, unknown>[];
    const userRow = rows.find((r) => r.author_id === adminUserId);
    // The -3 removal was movement_type = 'manual_remove'
    expect(Number(userRow!.manual_remove_qty)).toBe(3);
  });
});
