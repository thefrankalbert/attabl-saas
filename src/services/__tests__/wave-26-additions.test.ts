/**
 * Smoke tests for the service methods added in Waves 26 and 31.
 *
 * Coverage focus:
 *  - method callable
 *  - tenant_id is propagated to the underlying Supabase chain (security
 *    invariant for multi-tenant isolation)
 *  - happy path returns the expected shape
 *  - error path throws ServiceError
 *
 * These are intentionally narrow: full DB mock coverage of every chain
 * variation belongs in the per-service test files. The goal here is
 * regression protection on the methods most recently introduced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderService } from '../order.service';
import { createCategoryService } from '../category.service';
import { createMenuService } from '../menu.service';
import { createInventoryService } from '../inventory.service';
import { createSuggestionService } from '../suggestion.service';
import { createTableConfigService } from '../table-config.service';
import { createAuditReadService } from '../audit.service';
import { createServiceManagerService } from '../service-manager.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Generic chainable mock ─────────────────────────────────
//
// Returns a thenable proxy that records every method call. Each chain
// method (.select, .eq, .in, .order, .single, .maybeSingle, .is,
// .limit, .range, .ilike, .not, .gte, .update, .delete, .insert) returns
// the same proxy so we can assert on the call sequence without juggling
// per-table mocks. The `_finalResult` is what the await resolves to.

type SupaResult = { data?: unknown; count?: number; error?: { message: string } | null };

interface ChainProxy {
  _finalResult: SupaResult;
  _calls: { method: string; args: unknown[] }[];
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  then: (resolve: (v: SupaResult) => unknown) => unknown;
}

function buildChain(finalResult: SupaResult = { data: [], error: null }): ChainProxy {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = {} as ChainProxy;
  chain._finalResult = finalResult;
  chain._calls = calls;
  for (const method of [
    'select',
    'eq',
    'in',
    'order',
    'is',
    'limit',
    'range',
    'ilike',
    'not',
    'gte',
    'update',
    'delete',
    'insert',
  ] as const) {
    (chain as unknown as Record<string, unknown>)[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    });
  }
  // Terminal methods: resolve to finalResult
  chain.single = vi.fn((...args: unknown[]) => {
    calls.push({ method: 'single', args });
    return Promise.resolve(finalResult);
  });
  chain.maybeSingle = vi.fn((...args: unknown[]) => {
    calls.push({ method: 'maybeSingle', args });
    return Promise.resolve(finalResult);
  });
  // Make the chain itself awaitable (resolves to finalResult)
  chain.then = (resolve) => resolve(finalResult);
  return chain;
}

interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  _chains: Record<string, ChainProxy[]>;
}

function buildSupabase(tableResults: Record<string, SupaResult | SupaResult[]> = {}): MockSupabase {
  const chainsByTable: Record<string, ChainProxy[]> = {};
  const callIndex: Record<string, number> = {};

  const fromFn = vi.fn((table: string) => {
    const result = tableResults[table];
    let finalResult: SupaResult = { data: [], error: null };
    if (Array.isArray(result)) {
      const idx = callIndex[table] || 0;
      finalResult = result[idx] ?? result[result.length - 1] ?? finalResult;
      callIndex[table] = idx + 1;
    } else if (result) {
      finalResult = result;
    }
    const chain = buildChain(finalResult);
    if (!chainsByTable[table]) chainsByTable[table] = [];
    chainsByTable[table].push(chain);
    return chain;
  });

  return {
    from: fromFn,
    rpc: vi.fn(),
    _chains: chainsByTable,
  };
}

function asSupabase(mock: MockSupabase): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

/** Returns true if the chain recorded a call to `eq('tenant_id', tenantId)`. */
function hasTenantFilter(chain: ChainProxy, tenantId: string): boolean {
  return chain._calls.some(
    (c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === tenantId,
  );
}

// ─── order.service ──────────────────────────────────────────

describe('order.service Wave 26 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updateStatus filters by tenant_id', async () => {
    const supabase = buildSupabase({ orders: { data: null, error: null } });
    const svc = createOrderService(asSupabase(supabase));
    await svc.updateStatus('order-1', 'tenant-A', 'delivered');
    expect(hasTenantFilter(supabase._chains.orders[0], 'tenant-A')).toBe(true);
  });

  it('updateStatus throws ServiceError on DB error', async () => {
    const supabase = buildSupabase({ orders: { data: null, error: { message: 'boom' } } });
    const svc = createOrderService(asSupabase(supabase));
    await expect(svc.updateStatus('o', 't', 'delivered')).rejects.toBeInstanceOf(ServiceError);
  });

  it('markPaid sets payment_method/payment_status/paid_at and filters tenant_id', async () => {
    const supabase = buildSupabase({ orders: { data: null, error: null } });
    const svc = createOrderService(asSupabase(supabase));
    await svc.markPaid('order-1', 'tenant-A', { method: 'cash', tipAmount: 500 });
    const chain = supabase._chains.orders[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    const updateCall = chain._calls.find((c) => c.method === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.payment_method).toBe('cash');
    expect(payload.payment_status).toBe('paid');
    expect(payload.tip_amount).toBe(500);
    expect(payload.paid_at).toBeTypeOf('string');
  });

  it('markPaid omits tip_amount when 0', async () => {
    const supabase = buildSupabase({ orders: { data: null, error: null } });
    const svc = createOrderService(asSupabase(supabase));
    await svc.markPaid('order-1', 'tenant-A', { method: 'card' });
    const updateCall = supabase._chains.orders[0]._calls.find((c) => c.method === 'update');
    expect((updateCall!.args[0] as Record<string, unknown>).tip_amount).toBeUndefined();
  });

  it('listReadyOrdersToday filters by tenant_id and status=ready', async () => {
    const supabase = buildSupabase({ orders: { data: [{ id: 'o1' }], error: null } });
    const svc = createOrderService(asSupabase(supabase));
    const result = await svc.listReadyOrdersToday('tenant-A');
    const chain = supabase._chains.orders[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'ready',
      ),
    ).toBe(true);
    expect(result).toEqual([{ id: 'o1' }]);
  });

  it('getCurrentOrderForTable filters by tenant_id and table_id', async () => {
    const supabase = buildSupabase({ orders: { data: { id: 'o1' }, error: null } });
    const svc = createOrderService(asSupabase(supabase));
    const result = await svc.getCurrentOrderForTable('tenant-A', 'table-1');
    const chain = supabase._chains.orders[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'table_id' && c.args[1] === 'table-1',
      ),
    ).toBe(true);
    expect(result).toEqual({ id: 'o1' });
  });
});

// ─── category.service ───────────────────────────────────────

describe('category.service Wave 26 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reorderCategories filters tenant_id on every update', async () => {
    const supabase = buildSupabase({ categories: { data: null, error: null } });
    const svc = createCategoryService(asSupabase(supabase));
    await svc.reorderCategories('tenant-A', [
      { id: 'cat-1', display_order: 0 },
      { id: 'cat-2', display_order: 1 },
    ]);
    const chains = supabase._chains.categories;
    expect(chains).toHaveLength(2);
    for (const chain of chains) {
      expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    }
  });

  it('isCategoryLinkedToMenu returns true when pivot has rows + filters categories.tenant_id', async () => {
    const supabase = buildSupabase({ menu_categories: { data: [{ id: 'mc1' }], error: null } });
    const svc = createCategoryService(asSupabase(supabase));
    const linked = await svc.isCategoryLinkedToMenu('cat-1', 'tenant-A');
    expect(linked).toBe(true);
    const chain = supabase._chains.menu_categories[0];
    expect(
      chain._calls.some(
        (c) =>
          c.method === 'eq' && c.args[0] === 'categories.tenant_id' && c.args[1] === 'tenant-A',
      ),
    ).toBe(true);
  });

  it('isCategoryLinkedToMenu returns false when empty', async () => {
    const supabase = buildSupabase({ menu_categories: { data: [], error: null } });
    const svc = createCategoryService(asSupabase(supabase));
    expect(await svc.isCategoryLinkedToMenu('cat-1', 'tenant-A')).toBe(false);
  });
});

// ─── menu.service ───────────────────────────────────────────

describe('menu.service Wave 26 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMenuDetailBundle filters menus AND categories AND items by tenant_id', async () => {
    const supabase = buildSupabase({
      menus: { data: { id: 'm1', name: 'Menu' }, error: null },
      categories: [
        { data: [{ id: 'c1' }], error: null }, // categories of menu
        { data: [], error: null }, // available (unassigned) categories
      ],
      menu_items: { data: [{ id: 'i1' }], error: null },
    });
    const svc = createMenuService(asSupabase(supabase));
    const bundle = await svc.getMenuDetailBundle('tenant-A', 'menu-1');

    // Wave 31 added tenant filter to the menus SELECT
    expect(hasTenantFilter(supabase._chains.menus[0], 'tenant-A')).toBe(true);
    // Both categories queries filter tenant
    for (const c of supabase._chains.categories) {
      expect(hasTenantFilter(c, 'tenant-A')).toBe(true);
    }
    // Items filter tenant
    expect(hasTenantFilter(supabase._chains.menu_items[0], 'tenant-A')).toBe(true);

    expect(bundle.menu).toEqual({ id: 'm1', name: 'Menu' });
    expect(bundle.categories).toEqual([{ id: 'c1' }]);
    expect(bundle.items).toEqual([{ id: 'i1' }]);
  });

  it('getMenuDetailBundle skips items query when no categories', async () => {
    const supabase = buildSupabase({
      menus: { data: { id: 'm1' }, error: null },
      categories: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    });
    const svc = createMenuService(asSupabase(supabase));
    const bundle = await svc.getMenuDetailBundle('tenant-A', 'menu-1');
    expect(bundle.items).toEqual([]);
    expect(supabase._chains.menu_items).toBeUndefined();
  });

  it('getMenuDetailBundle throws ServiceError when menu fetch fails', async () => {
    const supabase = buildSupabase({
      menus: { data: null, error: { message: 'denied' } },
    });
    const svc = createMenuService(asSupabase(supabase));
    await expect(svc.getMenuDetailBundle('tenant-A', 'menu-1')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

// ─── inventory.service ──────────────────────────────────────

describe('inventory.service Wave 26 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getRecipesOverview returns menuItems + recipeItemIds Set', async () => {
    const supabase = buildSupabase({
      menu_items: {
        data: [
          { id: 'i1', name: 'Burger', category_id: 'c1', is_available: true },
          { id: 'i2', name: 'Fries', category_id: 'c1', is_available: true },
        ],
        error: null,
      },
      recipes: { data: [{ menu_item_id: 'i1' }], error: null },
    });
    const svc = createInventoryService(asSupabase(supabase));
    const overview = await svc.getRecipesOverview('tenant-A');

    expect(hasTenantFilter(supabase._chains.menu_items[0], 'tenant-A')).toBe(true);
    expect(hasTenantFilter(supabase._chains.recipes[0], 'tenant-A')).toBe(true);
    expect(overview.menuItems).toHaveLength(2);
    expect(overview.recipeItemIds).toBeInstanceOf(Set);
    expect(overview.recipeItemIds.has('i1')).toBe(true);
    expect(overview.recipeItemIds.has('i2')).toBe(false);
  });

  it('getRecipesOverview throws ServiceError when menu_items fails', async () => {
    const supabase = buildSupabase({
      menu_items: { data: null, error: { message: 'fail' } },
      recipes: { data: [], error: null },
    });
    const svc = createInventoryService(asSupabase(supabase));
    await expect(svc.getRecipesOverview('tenant-A')).rejects.toBeInstanceOf(ServiceError);
  });
});

// ─── suggestion.service ─────────────────────────────────────

describe('suggestion.service Wave 26 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listAvailableItems filters tenant_id + is_available', async () => {
    const supabase = buildSupabase({
      menu_items: { data: [{ id: 'i1', name: 'Pizza' }], error: null },
    });
    const svc = createSuggestionService(asSupabase(supabase));
    const items = await svc.listAvailableItems('tenant-A');
    const chain = supabase._chains.menu_items[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'is_available' && c.args[1] === true,
      ),
    ).toBe(true);
    expect(items).toEqual([{ id: 'i1', name: 'Pizza' }]);
  });

  it('listActiveSuggestions filters tenant_id + is_active', async () => {
    const supabase = buildSupabase({
      item_suggestions: { data: [{ id: 's1' }], error: null },
    });
    const svc = createSuggestionService(asSupabase(supabase));
    await svc.listActiveSuggestions('tenant-A');
    const chain = supabase._chains.item_suggestions[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'is_active' && c.args[1] === true,
      ),
    ).toBe(true);
  });

  it('listAvailableItems throws ServiceError on DB error', async () => {
    const supabase = buildSupabase({
      menu_items: { data: null, error: { message: 'fail' } },
    });
    const svc = createSuggestionService(asSupabase(supabase));
    await expect(svc.listAvailableItems('tenant-A')).rejects.toBeInstanceOf(ServiceError);
  });
});

// ─── table-config.service (Wave 31 hardened to require tenantId) ─

describe('table-config.service Wave 26+31 additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listZonesForVenue requires tenantId and filters via venues join', async () => {
    const supabase = buildSupabase({
      zones: { data: [{ id: 'z1' }], error: null },
    });
    const svc = createTableConfigService(asSupabase(supabase));
    await svc.listZonesForVenue('tenant-A', 'venue-1');
    const chain = supabase._chains.zones[0];
    // Wave 31 added the venues.tenant_id join filter
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'venues.tenant_id' && c.args[1] === 'tenant-A',
      ),
    ).toBe(true);
    expect(chain._calls.some((c) => c.method === 'eq' && c.args[0] === 'venue_id')).toBe(true);
  });

  it('listTablesForZone requires tenantId and filters via zones->venues join', async () => {
    const supabase = buildSupabase({
      tables: { data: [{ id: 't1' }], error: null },
    });
    const svc = createTableConfigService(asSupabase(supabase));
    await svc.listTablesForZone('tenant-A', 'zone-1');
    const chain = supabase._chains.tables[0];
    expect(
      chain._calls.some(
        (c) =>
          c.method === 'eq' && c.args[0] === 'zones.venues.tenant_id' && c.args[1] === 'tenant-A',
      ),
    ).toBe(true);
  });
});

// ─── audit.service.createAuditReadService ───────────────────

describe('audit.service.createAuditReadService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listLogs filters tenant_id + paginates via range', async () => {
    const supabase = buildSupabase({
      audit_log: { data: [{ id: 'a1' }], count: 42, error: null },
    });
    const svc = createAuditReadService(asSupabase(supabase));
    const result = await svc.listLogs({
      tenantId: 'tenant-A',
      page: 0,
      pageSize: 25,
    });
    const chain = supabase._chains.audit_log[0];
    expect(hasTenantFilter(chain, 'tenant-A')).toBe(true);
    expect(
      chain._calls.some((c) => c.method === 'range' && c.args[0] === 0 && c.args[1] === 24),
    ).toBe(true);
    expect(result).toEqual({ logs: [{ id: 'a1' }], count: 42 });
  });

  it('listLogs applies optional action / entityType / searchEmail filters', async () => {
    const supabase = buildSupabase({
      audit_log: { data: [], count: 0, error: null },
    });
    const svc = createAuditReadService(asSupabase(supabase));
    await svc.listLogs({
      tenantId: 'tenant-A',
      page: 0,
      pageSize: 25,
      action: 'update',
      entityType: 'order',
      searchEmail: 'foo',
    });
    const chain = supabase._chains.audit_log[0];
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'action' && c.args[1] === 'update',
      ),
    ).toBe(true);
    expect(
      chain._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'entity_type' && c.args[1] === 'order',
      ),
    ).toBe(true);
    expect(chain._calls.some((c) => c.method === 'ilike' && c.args[0] === 'user_email')).toBe(true);
  });
});

// ─── service-manager.service ────────────────────────────────

describe('service-manager.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loadDashboard fetches zones + admin_users + ready orders, all tenant-filtered', async () => {
    const supabase = buildSupabase({
      zones: { data: [{ id: 'z1' }], error: null },
      admin_users: { data: [{ id: 'u1' }], error: null },
      orders: { data: [{ id: 'o1' }], error: null },
    });
    const svc = createServiceManagerService(asSupabase(supabase));
    const result = await svc.loadDashboard('tenant-A');

    expect(
      supabase._chains.zones[0]._calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'venues.tenant_id' && c.args[1] === 'tenant-A',
      ),
    ).toBe(true);
    expect(hasTenantFilter(supabase._chains.admin_users[0], 'tenant-A')).toBe(true);
    expect(hasTenantFilter(supabase._chains.orders[0], 'tenant-A')).toBe(true);

    expect(result.zones).toEqual([{ id: 'z1' }]);
    expect(result.servers).toEqual([{ id: 'u1' }]);
    expect(result.readyOrders).toEqual([{ id: 'o1' }]);
  });

  it('loadDashboard throws ServiceError when zones fail', async () => {
    const supabase = buildSupabase({
      zones: { data: null, error: { message: 'denied' } },
      admin_users: { data: [], error: null },
      orders: { data: [], error: null },
    });
    const svc = createServiceManagerService(asSupabase(supabase));
    await expect(svc.loadDashboard('tenant-A')).rejects.toBeInstanceOf(ServiceError);
  });
});
