/**
 * UPDATE + `or` filter against a REAL PostgREST.
 *
 * PostgREST v14.3 rejects an `or` filter combined with returning the updated
 * rows (`.select()` after `.update()`): 42703 "column <table>.<col> does not
 * exist", service role included. Measured 2026-11-08. Two services used that
 * shape, so the server order claim and the nightly GDPR anonymisation always
 * failed; unit tests with fakes could not see it. These tests run the real
 * services against the local stack (pnpm test:db).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { createAssignmentService } from '@/services/assignment.service';
import { createRetentionService } from '@/services/retention.service';

const SLUG = `qa-or-${randomUUID().slice(0, 8)}`;
let tenantId = '';

async function newOrder(over: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await getAdmin()
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `QA-${randomUUID().slice(0, 6)}`,
      subtotal: 1000,
      total: 1000,
      ...over,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`order seed: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  const { data, error } = await getAdmin()
    .from('tenants')
    .insert({ slug: SLUG, name: SLUG, is_active: true })
    .select('id')
    .single();
  if (error || !data) throw new Error(`tenant seed: ${error?.message}`);
  tenantId = data.id;
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
});

describe('or-filtered updates on a real PostgREST', () => {
  it('witness: or + select really is rejected (42703)', async () => {
    const id = await newOrder();
    const { error } = await getAdmin()
      .from('orders')
      .update({ customer_name: 'x' })
      .eq('id', id)
      .or('customer_name.is.null,customer_name.eq.x')
      .select('id');
    expect(error?.code).toBe('42703');
  });

  it('claimOrder: first claim wins, the same server re-claims, another is refused', async () => {
    const id = await newOrder();
    const svc = createAssignmentService(getAdmin());
    // server_id references admin_users, whose user_id references auth.users.
    const admin = getAdmin();
    const staff: string[] = [];
    for (const label of ['a', 'b']) {
      const email = `${label}-${SLUG}@qa.test`;
      const { data: u, error: uErr } = await admin.auth.admin.createUser({
        email,
        password: `Pw-${randomUUID()}`,
        email_confirm: true,
      });
      if (uErr || !u.user) throw new Error(`auth seed: ${uErr?.message}`);
      const { data: row, error } = await admin
        .from('admin_users')
        .insert({
          tenant_id: tenantId,
          user_id: u.user.id,
          email,
          full_name: label,
          role: 'waiter',
          is_active: true,
        })
        .select('id')
        .single();
      if (error || !row) throw new Error(`admin seed: ${error?.message}`);
      staff.push(row.id);
    }
    const [serverA, serverB] = staff;

    await expect(svc.claimOrder(id, serverA, tenantId)).resolves.toBeUndefined();
    await expect(svc.claimOrder(id, serverA, tenantId)).resolves.toBeUndefined();
    await expect(svc.claimOrder(id, serverB, tenantId)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const { data } = await admin.from('orders').select('server_id').eq('id', id).single();
    expect(data?.server_id).toBe(serverA);
  });

  it('anonymiserCommandesAnciennes: clears old personal data, counts it, keeps recent orders', async () => {
    const old = await newOrder({
      customer_name: 'Awa',
      customer_phone: '+22600000000',
      created_at: '2020-01-01T00:00:00Z',
    });
    const recent = await newOrder({ customer_name: 'Recent' });

    const n = await createRetentionService(getAdmin()).anonymiserCommandesAnciennes();
    expect(n).toBeGreaterThanOrEqual(1);

    const { data: rows } = await getAdmin()
      .from('orders')
      .select('id, customer_name, customer_phone')
      .in('id', [old, recent]);
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
    expect(byId[old]).toMatchObject({ customer_name: null, customer_phone: null });
    expect(byId[recent].customer_name).toBe('Recent');
  });
});
