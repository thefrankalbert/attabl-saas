/**
 * Integration tests for phase 8 (comp/offert + manager notes + house accounts)
 * against a REAL local Postgres. Verifies the additive migration
 * 20260703200000: comp is columns-only (keeps destock, excluded from revenue,
 * present in get_daily_comps), house-account outstanding = due - ledger net, RLS
 * isolation, and the append-only order_notes trail. Driven by `pnpm test:db`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getAdmin, teardownTenantBySlug } from '../../journeys/fixtures/seed';
import { journeyEnv } from '../../journeys/fixtures/env';
import { createPaymentService } from '@/services/payment.service';
import { createOrderAnnotationService } from '@/services/order-annotation.service';

const ANON_KEY = process.env.JOURNEY_SUPABASE_ANON_KEY || '';
const SLUG = 'comp-house-account-test';
const db = getAdmin();

let tenantId: string;
let categoryId: string;
let adminId: string | null = null;

const WINDOW_START = '2020-01-01T00:00:00Z';
const WINDOW_END = '2100-01-01T00:00:00Z';

async function seedIngredient(openingStock: number): Promise<string> {
  const { data, error } = await db
    .from('ingredients')
    .insert({ tenant_id: tenantId, name: `Ing-${randomUUID().slice(0, 8)}`, unit: 'kg' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed ingredient: ${error?.message}`);
  await db.rpc('set_opening_stock', {
    p_ingredient_id: data.id,
    p_tenant_id: tenantId,
    p_quantity: openingStock,
  });
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
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed menu_item: ${error?.message}`);
  return data.id;
}

async function seedOrder(opts: {
  total: number;
  tip?: number;
  menuItemId?: string;
  quantity?: number;
  houseAccountId?: string;
}): Promise<string> {
  const { data: order, error } = await db
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_number: `CHA-${randomUUID().slice(0, 12)}`,
      status: 'ready',
      subtotal: opts.total,
      total: opts.total,
      tip_amount: opts.tip ?? 0,
      payment_status: 'pending',
      preparation_zone: 'kitchen',
      house_account_id: opts.houseAccountId ?? null,
    })
    .select('id')
    .single();
  if (error || !order) throw new Error(`seed order: ${error?.message}`);
  if (opts.menuItemId) {
    const { error: iErr } = await db.from('order_items').insert({
      order_id: order.id,
      menu_item_id: opts.menuItemId,
      quantity: opts.quantity ?? 1,
      price_at_order: opts.total,
      item_name: 'Item',
    });
    if (iErr) throw new Error(`seed order_item: ${iErr.message}`);
  }
  return order.id;
}

async function destockMovements(orderId: string) {
  const { data, error } = await db
    .from('stock_movements')
    .select('movement_type, quantity, ingredient_id')
    .eq('tenant_id', tenantId)
    .eq('reference_id', orderId);
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
    .insert({ slug: SLUG, name: 'Comp House Account', is_active: true })
    .select('id')
    .single();
  if (tErr || !tenant) throw new Error(`seed tenant: ${tErr?.message}`);
  tenantId = tenant.id;

  const { data: menu } = await db
    .from('menus')
    .insert({ tenant_id: tenantId, name: 'M', slug: 'm-cha' })
    .select('id')
    .single();
  const { data: cat, error: cErr } = await db
    .from('categories')
    .insert({ tenant_id: tenantId, menu_id: menu!.id, name: 'Plats' })
    .select('id')
    .single();
  if (cErr || !cat) throw new Error(`seed category: ${cErr?.message}`);
  categoryId = cat.id;

  // A member (for comped_by FK + append-only RLS). Needs a real auth user; the
  // local GoTrue autoconfirms anon signUp. Skipped if the runner did not export
  // an anon key.
  if (ANON_KEY) {
    const email = `manager-${randomUUID().slice(0, 8)}@test.local`;
    const password = 'Manager-Passw0rd!';
    const authClient = createClient(journeyEnv.supabaseUrl, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signUp = await authClient.auth.signUp({ email, password });
    const userId = signUp.data.user?.id;
    if (userId) {
      const { data: admin } = await db
        .from('admin_users')
        .insert({ tenant_id: tenantId, user_id: userId, email, role: 'owner', is_active: true })
        .select('id')
        .single();
      adminId = admin?.id ?? null;
    }
  }
});

afterAll(async () => {
  await teardownTenantBySlug(SLUG);
});

describe('comp / offert (real Postgres)', () => {
  it('comp keeps destock rows, sets comp columns, and is excluded from revenue but present in get_daily_comps', async () => {
    const ing = await seedIngredient(100);
    const item = await seedMenuItem();
    await db.from('recipes').insert({
      tenant_id: tenantId,
      menu_item_id: item,
      ingredient_id: ing,
      quantity_needed: 2,
    });
    const orderId = await seedOrder({ total: 5000, tip: 500, menuItemId: item, quantity: 3 });

    // Destock at "order creation".
    await db.rpc('destock_order', { p_order_id: orderId, p_tenant_id: tenantId });
    const movementsBefore = await destockMovements(orderId);
    const stockBefore = await getStock(ing);
    expect(movementsBefore.length).toBeGreaterThan(0);
    expect(stockBefore).toBe(100 - 6); // 3 units * 2 per unit

    // Comp the order (service against the real DB).
    const svc = createPaymentService(db);
    const res = await svc.compOrder(orderId, tenantId, {
      reason: 'Geste commercial',
      compedBy: adminId,
    });
    expect(res.comped).toBe(true);
    expect(res.summary.paymentStatus).toBe('comp');

    // Columns set; comp is NEVER a payments row.
    const { data: order } = await db
      .from('orders')
      .select('payment_status, is_comp, comp_reason, comped_by, comped_at, comp_amount')
      .eq('id', orderId)
      .single();
    expect(order?.payment_status).toBe('comp');
    expect(order?.is_comp).toBe(true);
    expect(order?.comp_reason).toBe('Geste commercial');
    expect(order?.comped_at).toBeTruthy();
    expect(Number(order?.comp_amount)).toBe(5500); // total + tip
    if (adminId) expect(order?.comped_by).toBe(adminId);

    const { count: payCount } = await db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);
    expect(payCount ?? 0).toBe(0);

    // Destock rows + stock UNCHANGED by the comp (ingredients stay consumed).
    const movementsAfter = await destockMovements(orderId);
    expect(movementsAfter.length).toBe(movementsBefore.length);
    expect(await getStock(ing)).toBe(stockBefore);

    // Revenue excludes the comp; get_daily_comps includes it.
    const { data: revenue } = await db.rpc('get_daily_revenue', {
      p_tenant_id: tenantId,
      p_start_date: WINDOW_START,
      p_end_date: WINDOW_END,
    });
    const revenueTotal = (revenue ?? []).reduce(
      (s: number, r: { revenue: number | string }) => s + Number(r.revenue),
      0,
    );
    expect(revenueTotal).toBe(0);

    const { data: comps } = await db.rpc('get_daily_comps', {
      p_tenant_id: tenantId,
      p_start_date: WINDOW_START,
      p_end_date: WINDOW_END,
    });
    const compTotal = (comps ?? []).reduce(
      (s: number, r: { comp_total: number | string }) => s + Number(r.comp_total),
      0,
    );
    const compCount = (comps ?? []).reduce(
      (s: number, r: { comp_count: number | string }) => s + Number(r.comp_count),
      0,
    );
    expect(compTotal).toBe(5500);
    expect(compCount).toBe(1);
  });

  it('comp guards: CONFLICT on paid and cancelled; idempotent no-op on already-comp', async () => {
    const svc = createPaymentService(db);

    const paidId = await seedOrder({ total: 3000 });
    await db.from('orders').update({ payment_status: 'paid' }).eq('id', paidId);
    await expect(
      svc.compOrder(paidId, tenantId, { reason: 'x', compedBy: adminId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const cancelledId = await seedOrder({ total: 3000 });
    await db.from('orders').update({ status: 'cancelled' }).eq('id', cancelledId);
    await expect(
      svc.compOrder(cancelledId, tenantId, { reason: 'x', compedBy: adminId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const compId = await seedOrder({ total: 3000 });
    const first = await svc.compOrder(compId, tenantId, { reason: 'once', compedBy: adminId });
    expect(first.comped).toBe(true);
    const replay = await svc.compOrder(compId, tenantId, { reason: 'twice', compedBy: adminId });
    expect(replay.comped).toBe(false);
    // The reason from the first comp is preserved (no second write).
    const { data } = await db.from('orders').select('comp_reason').eq('id', compId).single();
    expect(data?.comp_reason).toBe('once');
  });
});

describe('house accounts (real Postgres)', () => {
  it('outstanding = due - net; drops when an attached order is paid; settle marks status', async () => {
    const svc = createOrderAnnotationService(db);
    const { id: accountId } = await svc.createHouseAccount(tenantId, {
      name: 'Chambre 12',
      description: 'note client',
      createdBy: adminId,
    });

    const order1 = await seedOrder({ total: 2500, houseAccountId: accountId });
    const order2 = await seedOrder({ total: 4000, houseAccountId: accountId });
    // Partial 1000 tender on order1.
    await db.from('payments').insert({
      tenant_id: tenantId,
      order_id: order1,
      amount: 1000,
      method: 'cash',
      status: 'completed',
    });
    await db.from('orders').update({ payment_status: 'partial' }).eq('id', order1);

    const balances1 = await svc.listHouseAccountsWithBalances(tenantId);
    const b1 = balances1.find((a) => a.accountId === accountId);
    expect(b1?.openOrders).toBe(2);
    expect(b1?.outstanding).toBe(2500 - 1000 + 4000); // 5500

    // Pay order2 fully -> it drops off the outstanding tab.
    await db.from('orders').update({ payment_status: 'paid' }).eq('id', order2);
    const balances2 = await svc.listHouseAccountsWithBalances(tenantId);
    const b2 = balances2.find((a) => a.accountId === accountId);
    expect(b2?.openOrders).toBe(1);
    expect(b2?.outstanding).toBe(1500);

    // Settle.
    await svc.settleHouseAccount(accountId, tenantId, { settledBy: adminId });
    const { data: acc } = await db
      .from('house_accounts')
      .select('status, settled_at, settled_by')
      .eq('id', accountId)
      .single();
    expect(acc?.status).toBe('settled');
    expect(acc?.settled_at).toBeTruthy();
    if (adminId) expect(acc?.settled_by).toBe(adminId);

    // A settled account still returns a (residual) balance row.
    const balances3 = await svc.listHouseAccountsWithBalances(tenantId);
    expect(balances3.some((a) => a.accountId === accountId)).toBe(true);
  });
});

describe('order_notes append-only + RLS isolation (real Postgres)', () => {
  it('service_role adds + lists notes scoped to tenant + order', async () => {
    const svc = createOrderAnnotationService(db);
    const orderId = await seedOrder({ total: 1000 });
    await svc.addOrderNote(orderId, tenantId, { note: 'Client VIP', createdBy: adminId });
    await svc.addOrderNote(orderId, tenantId, { note: 'Table 4', createdBy: adminId });
    const notes = await svc.listOrderNotes(orderId, tenantId);
    expect(notes.map((n) => n.note)).toEqual(['Client VIP', 'Table 4']);
  });

  it.skipIf(!ANON_KEY)(
    'an authenticated non-member cannot read tenant notes/accounts and the balances RPC rejects',
    async () => {
      const orderId = await seedOrder({ total: 1000 });
      await createOrderAnnotationService(db).addOrderNote(orderId, tenantId, {
        note: 'secret',
        createdBy: adminId,
      });

      const email = `outsider-${randomUUID().slice(0, 8)}@test.local`;
      const password = 'Outsider-Passw0rd!';
      const outsider = createClient(journeyEnv.supabaseUrl, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signUp = await outsider.auth.signUp({ email, password });
      if (!signUp.data.session) {
        await outsider.auth.signInWithPassword({ email, password });
      }

      const notes = await outsider.from('order_notes').select('id').eq('tenant_id', tenantId);
      expect(notes.data ?? []).toHaveLength(0);
      const accounts = await outsider.from('house_accounts').select('id').eq('tenant_id', tenantId);
      expect(accounts.data ?? []).toHaveLength(0);

      const rpc = await outsider.rpc('get_house_account_balances', { p_tenant_id: tenantId });
      expect(rpc.error).not.toBeNull();
      expect(rpc.error?.message).toMatch(/access denied|not a member/i);
    },
  );

  it.skipIf(!ANON_KEY)(
    'a member can insert + select notes but UPDATE/DELETE are denied by RLS (append-only)',
    async () => {
      const orderId = await seedOrder({ total: 1000 });
      const email = `member-${randomUUID().slice(0, 8)}@test.local`;
      const password = 'Member-Passw0rd!';
      const member = createClient(journeyEnv.supabaseUrl, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signUp = await member.auth.signUp({ email, password });
      const userId = signUp.data.user?.id;
      if (!signUp.data.session) await member.auth.signInWithPassword({ email, password });
      if (!userId) return;
      await db
        .from('admin_users')
        .insert({ tenant_id: tenantId, user_id: userId, email, role: 'manager', is_active: true });

      // Insert + select succeed within the tenant.
      const ins = await member
        .from('order_notes')
        .insert({ tenant_id: tenantId, order_id: orderId, note: 'member note' })
        .select('id')
        .single();
      expect(ins.error).toBeNull();
      const noteId = ins.data?.id as string;

      const sel = await member.from('order_notes').select('id').eq('id', noteId);
      expect((sel.data ?? []).length).toBe(1);

      // UPDATE + DELETE are filtered by RLS (no policy) -> 0 rows affected, row intact.
      await member.from('order_notes').update({ note: 'tampered' }).eq('id', noteId);
      await member.from('order_notes').delete().eq('id', noteId);

      const { data: after } = await db.from('order_notes').select('note').eq('id', noteId).single();
      expect(after?.note).toBe('member note');
    },
  );
});
