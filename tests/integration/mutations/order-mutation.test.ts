/**
 * Integration tests for the offline order-mutation write path against a REAL
 * local Postgres. The unit suite (src/app/api/__tests__/orders-mutations.test.ts)
 * mocks Supabase, so the load-bearing DB behavior is never executed:
 *  - the order_mutation_requests table, its UNIQUE(client_request_id) and the
 *    processed_at idempotency column (migration 20260717000000),
 *  - the tenant-scoping the cross-tenant tableId guard in assignServerToTable
 *    relies on.
 *
 * These use the service_role client only (no auth session): the local stack's
 * GoTrue rejects the new-format key for auth.admin.createUser, so the RLS
 * member-insert path is exercised by the endpoint's own membership check + the
 * unit test rather than here. The RLS POLICY itself is validated by this same
 * migration applying cleanly during bootstrap (CREATE POLICY would fail loudly).
 *
 * Driven by `pnpm test:db` (scripts/run-stock-integration.sh): boots local
 * Supabase, loads the prod schema snapshot + post-marker migrations (so this
 * migration IS applied), injects JOURNEY_SUPABASE_* env.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  getAdmin,
  seedTenantWithMenu,
  seedZoneAndTable,
  teardownTenantBySlug,
} from '../../journeys/fixtures/seed';

const SLUG_A = 'mut-it-a';
const SLUG_B = 'mut-it-b';
const db = getAdmin();

let tenantA = '';
let tenantB = '';

beforeAll(async () => {
  const a = await seedTenantWithMenu({ slug: SLUG_A });
  const b = await seedTenantWithMenu({ slug: SLUG_B });
  tenantA = a.tenantId;
  tenantB = b.tenantId;

  // order_mutation_requests is created by a DELTA migration applied AFTER
  // PostgREST started; its schema-cache reload (NOTIFY pgrst) is async, so wait
  // until the new table is queryable before the tests run (PGRST205 = not yet
  // in cache).
  for (let i = 0; i < 30; i++) {
    const probe = await db.from('order_mutation_requests').select('client_request_id').limit(0);
    if (probe.error?.code !== 'PGRST205') break;
    await new Promise((r) => setTimeout(r, 500));
  }
}, 60000);

afterAll(async () => {
  await teardownTenantBySlug(SLUG_A);
  await teardownTenantBySlug(SLUG_B);
});

describe('order_mutation_requests (idempotency table, migration 20260717000000)', () => {
  it('accepts a key, then rejects a duplicate client_request_id with 23505', async () => {
    const rid = randomUUID();
    const first = await db
      .from('order_mutation_requests')
      .insert({ client_request_id: rid, tenant_id: tenantA });
    expect(first.error).toBeNull();

    // The endpoint depends on exactly this: a replayed request hits the UNIQUE
    // constraint (23505) instead of inserting a second row.
    const dup = await db
      .from('order_mutation_requests')
      .insert({ client_request_id: rid, tenant_id: tenantA });
    expect(dup.error?.code).toBe('23505');
  });

  it('has a processed_at column that starts NULL and can be stamped', async () => {
    const rid = randomUUID();
    await db.from('order_mutation_requests').insert({ client_request_id: rid, tenant_id: tenantA });

    const before = await db
      .from('order_mutation_requests')
      .select('processed_at')
      .eq('client_request_id', rid)
      .single();
    expect(before.error).toBeNull();
    // A fresh claim is in-flight (NULL) -> the endpoint answers 409, not success.
    expect(before.data?.processed_at).toBeNull();

    const stamp = new Date().toISOString();
    await db
      .from('order_mutation_requests')
      .update({ processed_at: stamp })
      .eq('client_request_id', rid);

    const after = await db
      .from('order_mutation_requests')
      .select('processed_at')
      .eq('client_request_id', rid)
      .single();
    // Once stamped, a replay dedupes as success.
    expect(after.data?.processed_at).not.toBeNull();
  });

  it('cascades away when its tenant is deleted (ON DELETE CASCADE)', async () => {
    const { data: tmp } = await db
      .from('tenants')
      .insert({ slug: `mut-it-cascade-${randomUUID().slice(0, 8)}`, name: 'Cascade' })
      .select('id')
      .single();
    const tmpTenant = tmp!.id as string;
    const rid = randomUUID();
    const ins = await db
      .from('order_mutation_requests')
      .insert({ client_request_id: rid, tenant_id: tmpTenant });
    expect(ins.error).toBeNull();

    await db.from('tenants').delete().eq('id', tmpTenant);

    const gone = await db
      .from('order_mutation_requests')
      .select('client_request_id')
      .eq('client_request_id', rid)
      .maybeSingle();
    expect(gone.data).toBeNull();
  });
});

describe('assignServerToTable cross-tenant guard (the exact scoping query)', () => {
  it('resolves a same-tenant table and returns nothing for another tenant table_id', async () => {
    const tableA = await seedZoneAndTable(tenantA);
    const tableB = await seedZoneAndTable(tenantB);

    // The guard added to assignServerToTable is:
    //   from('tables').select('id').eq('id', tableId).eq('tenant_id', tenantId).single()
    // Same tenant -> found.
    const own = await db
      .from('tables')
      .select('id')
      .eq('id', tableA.tableId)
      .eq('tenant_id', tenantA)
      .maybeSingle();
    expect(own.data?.id).toBe(tableA.tableId);

    // Tenant A asking for tenant B's table -> not found -> the guard throws.
    const foreign = await db
      .from('tables')
      .select('id')
      .eq('id', tableB.tableId)
      .eq('tenant_id', tenantA)
      .maybeSingle();
    expect(foreign.data).toBeNull();
  });
});
