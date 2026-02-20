import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryService } from '../inventory.service';
import { ServiceError } from '../errors';
import type { AdjustStockInput, RecipeLineInput } from '@/types/inventory.types';

// Mock the logger to avoid Sentry imports in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

/**
 * Helper to build a chainable mock Supabase client for inventory tests.
 *
 * The inventory service uses both `supabase.from(...)` chains and
 * `supabase.rpc(...)` calls, as well as `supabase.auth.getUser()`.
 */
function createMockSupabase() {
  // Terminal result that resolves by default
  const terminalResult = { data: null, error: null };

  // A flexible chain builder: every method returns itself so any
  // combination of .select().eq().eq().order() etc. works.
  function buildChain(terminal: { data: unknown; error: unknown } = terminalResult) {
    const chain: Record<string, unknown> = {};

    const self = new Proxy(chain, {
      get(_target, prop: string) {
        if (prop === 'then') return undefined; // not a thenable
        if (!chain[prop]) {
          // Terminal methods resolve; chainable methods return self
          chain[prop] = vi.fn().mockReturnValue(self);
        }
        return chain[prop];
      },
    });

    // Override terminal methods to resolve with data
    // We'll set the terminal on the final call, so callers can override.
    chain._resolve = vi.fn().mockResolvedValue(terminal);
    chain._self = self;

    return self;
  }

  // Store chains by table so tests can configure resolved data
  const tableChains: Record<string, ReturnType<typeof buildChain>> = {};

  const mockFrom = vi.fn((table: string) => {
    if (!tableChains[table]) {
      tableChains[table] = buildChain();
    }
    return tableChains[table];
  });

  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const mockAuth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    }),
  };

  return {
    from: mockFrom,
    rpc: mockRpc,
    auth: mockAuth,
    _tableChains: tableChains,
  };
}

/** Cast mock to SupabaseClient for the service factory */
function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

describe('InventoryService', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let service: ReturnType<typeof createInventoryService>;

  beforeEach(() => {
    supabase = createMockSupabase();
    service = createInventoryService(asSupabase(supabase));
  });

  // ─── Ingredients ──────────────────────────────────────

  describe('getIngredients', () => {
    it('should return list of ingredients for tenant', async () => {
      const mockIngredients = [
        { id: 'ing-1', name: 'Farine', unit: 'kg', tenant_id: 't1' },
        { id: 'ing-2', name: 'Sel', unit: 'g', tenant_id: 't1' },
      ];

      // Build the exact chain: .from('ingredients').select('*').eq(...).eq(...).order(...)
      const orderFn = vi.fn().mockResolvedValue({ data: mockIngredients, error: null });
      const eqIsActive = vi.fn().mockReturnValue({ order: orderFn });
      const eqTenant = vi.fn().mockReturnValue({ eq: eqIsActive });
      const selectFn = vi.fn().mockReturnValue({ eq: eqTenant });
      supabase.from = vi.fn().mockReturnValue({ select: selectFn });

      const result = await service.getIngredients('t1');

      expect(supabase.from).toHaveBeenCalledWith('ingredients');
      expect(selectFn).toHaveBeenCalledWith('*');
      expect(eqTenant).toHaveBeenCalledWith('tenant_id', 't1');
      expect(eqIsActive).toHaveBeenCalledWith('is_active', true);
      expect(orderFn).toHaveBeenCalledWith('name');
      expect(result).toEqual(mockIngredients);
    });

    it('should throw INTERNAL ServiceError on DB error', async () => {
      const orderFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB failure' } });
      const eqIsActive = vi.fn().mockReturnValue({ order: orderFn });
      const eqTenant = vi.fn().mockReturnValue({ eq: eqIsActive });
      const selectFn = vi.fn().mockReturnValue({ eq: eqTenant });
      supabase.from = vi.fn().mockReturnValue({ select: selectFn });

      await expect(service.getIngredients('t1')).rejects.toThrow(ServiceError);
      await expect(service.getIngredients('t1')).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  describe('createIngredient', () => {
    it('should create ingredient with defaults (current_stock=0, min_stock_alert=0, cost_per_unit=0)', async () => {
      const createdIngredient = {
        id: 'ing-new',
        tenant_id: 't1',
        name: 'Beurre',
        unit: 'kg',
        current_stock: 0,
        min_stock_alert: 0,
        cost_per_unit: 0,
        category: null,
      };

      const singleFn = vi.fn().mockResolvedValue({ data: createdIngredient, error: null });
      const selectFn = vi.fn().mockReturnValue({ single: singleFn });
      const insertFn = vi.fn().mockReturnValue({ select: selectFn });
      supabase.from = vi.fn().mockReturnValue({ insert: insertFn });

      const result = await service.createIngredient('t1', {
        name: 'Beurre',
        unit: 'kg',
      });

      expect(supabase.from).toHaveBeenCalledWith('ingredients');
      expect(insertFn).toHaveBeenCalledWith({
        tenant_id: 't1',
        name: 'Beurre',
        unit: 'kg',
        current_stock: 0,
        min_stock_alert: 0,
        cost_per_unit: 0,
        category: null,
      });
      expect(result).toEqual(createdIngredient);
    });

    it('should throw INTERNAL ServiceError on insert error', async () => {
      const singleFn = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'unique constraint' } });
      const selectFn = vi.fn().mockReturnValue({ single: singleFn });
      const insertFn = vi.fn().mockReturnValue({ select: selectFn });
      supabase.from = vi.fn().mockReturnValue({ insert: insertFn });

      await expect(
        service.createIngredient('t1', { name: 'Duplicate', unit: 'kg' }),
      ).rejects.toThrow(ServiceError);
      await expect(
        service.createIngredient('t1', { name: 'Duplicate', unit: 'kg' }),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
    });
  });

  describe('updateIngredient', () => {
    it('should update specific fields', async () => {
      const updated = {
        id: 'ing-1',
        tenant_id: 't1',
        name: 'Farine T55',
        unit: 'kg',
        min_stock_alert: 5,
      };

      const singleFn = vi.fn().mockResolvedValue({ data: updated, error: null });
      const selectFn = vi.fn().mockReturnValue({ single: singleFn });
      const eqTenant = vi.fn().mockReturnValue({ select: selectFn });
      const eqId = vi.fn().mockReturnValue({ eq: eqTenant });
      const updateFn = vi.fn().mockReturnValue({ eq: eqId });
      supabase.from = vi.fn().mockReturnValue({ update: updateFn });

      const input = { name: 'Farine T55', min_stock_alert: 5 };
      const result = await service.updateIngredient('ing-1', 't1', input);

      expect(supabase.from).toHaveBeenCalledWith('ingredients');
      expect(updateFn).toHaveBeenCalledWith(input);
      expect(eqId).toHaveBeenCalledWith('id', 'ing-1');
      expect(eqTenant).toHaveBeenCalledWith('tenant_id', 't1');
      expect(result).toEqual(updated);
    });
  });

  // ─── Recipes ──────────────────────────────────────────

  describe('getRecipesForItem', () => {
    it('should return recipes with ingredient details (joined)', async () => {
      const mockRecipes = [
        {
          id: 'r1',
          menu_item_id: 'mi-1',
          ingredient_id: 'ing-1',
          quantity_needed: 0.2,
          ingredient: { id: 'ing-1', name: 'Farine', unit: 'kg', current_stock: 10 },
        },
      ];

      const eqTenant = vi.fn().mockResolvedValue({ data: mockRecipes, error: null });
      const eqMenuItem = vi.fn().mockReturnValue({ eq: eqTenant });
      const selectFn = vi.fn().mockReturnValue({ eq: eqMenuItem });
      supabase.from = vi.fn().mockReturnValue({ select: selectFn });

      const result = await service.getRecipesForItem('mi-1', 't1');

      expect(supabase.from).toHaveBeenCalledWith('recipes');
      expect(selectFn).toHaveBeenCalledWith(
        '*, ingredient:ingredients(id, name, unit, current_stock)',
      );
      expect(eqMenuItem).toHaveBeenCalledWith('menu_item_id', 'mi-1');
      expect(eqTenant).toHaveBeenCalledWith('tenant_id', 't1');
      expect(result).toEqual(mockRecipes);
    });
  });

  describe('setRecipe', () => {
    it('should delete existing and insert new lines', async () => {
      // The service calls .from('recipes').delete().eq(...).eq(...)
      // then .from('recipes').insert(rows)
      const lines: RecipeLineInput[] = [
        { ingredient_id: 'ing-1', quantity_needed: 0.5, notes: 'sifted' },
        { ingredient_id: 'ing-2', quantity_needed: 0.1 },
      ];

      // Track calls in order
      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: delete chain
          const eqTenant = vi.fn().mockResolvedValue({ error: null });
          const eqMenuItem = vi.fn().mockReturnValue({ eq: eqTenant });
          const deleteFn = vi.fn().mockReturnValue({ eq: eqMenuItem });
          return { delete: deleteFn };
        }
        // Second call: insert
        const insertFn = vi.fn().mockResolvedValue({ error: null });
        return { insert: insertFn };
      });

      await service.setRecipe('t1', 'mi-1', lines);

      expect(supabase.from).toHaveBeenCalledTimes(2);
      expect(supabase.from).toHaveBeenNthCalledWith(1, 'recipes');
      expect(supabase.from).toHaveBeenNthCalledWith(2, 'recipes');
    });
  });

  // ─── Stock Operations ─────────────────────────────────

  describe('destockOrder', () => {
    it('should call RPC destock_order and return count', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({ data: 5, error: null });

      const result = await service.destockOrder('order-1', 't1');

      expect(supabase.rpc).toHaveBeenCalledWith('destock_order', {
        p_order_id: 'order-1',
        p_tenant_id: 't1',
      });
      expect(result).toBe(5);
    });
  });

  describe('adjustStock', () => {
    it('should call RPC adjust_ingredient_stock and record movement', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      supabase.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const insertFn = vi.fn().mockResolvedValue({ error: null });
      supabase.from = vi.fn().mockReturnValue({ insert: insertFn });

      const input: AdjustStockInput = {
        ingredient_id: 'ing-1',
        quantity: 10,
        movement_type: 'manual_add',
        notes: 'restocking',
        supplier_id: 'sup-1',
      };

      await service.adjustStock('t1', input);

      expect(supabase.rpc).toHaveBeenCalledWith('adjust_ingredient_stock', {
        p_tenant_id: 't1',
        p_ingredient_id: 'ing-1',
        p_delta: 10,
      });
      expect(supabase.from).toHaveBeenCalledWith('stock_movements');
      expect(insertFn).toHaveBeenCalledWith({
        tenant_id: 't1',
        ingredient_id: 'ing-1',
        movement_type: 'manual_add',
        quantity: 10,
        notes: 'restocking',
        created_by: 'user-1',
        supplier_id: 'sup-1',
      });
    });

    it('should use negative delta for manual_remove type', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      supabase.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const insertFn = vi.fn().mockResolvedValue({ error: null });
      supabase.from = vi.fn().mockReturnValue({ insert: insertFn });

      const input: AdjustStockInput = {
        ingredient_id: 'ing-1',
        quantity: 3,
        movement_type: 'manual_remove',
      };

      await service.adjustStock('t1', input);

      // manual_remove should produce negative delta
      expect(supabase.rpc).toHaveBeenCalledWith('adjust_ingredient_stock', {
        p_tenant_id: 't1',
        p_ingredient_id: 'ing-1',
        p_delta: -3,
      });
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: -3,
          movement_type: 'manual_remove',
        }),
      );
    });

    it('should get current user for audit trail', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      supabase.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'audit-user-42' } },
        error: null,
      });

      const insertFn = vi.fn().mockResolvedValue({ error: null });
      supabase.from = vi.fn().mockReturnValue({ insert: insertFn });

      const input: AdjustStockInput = {
        ingredient_id: 'ing-1',
        quantity: 1,
        movement_type: 'manual_add',
      };

      await service.adjustStock('t1', input);

      expect(supabase.auth.getUser).toHaveBeenCalled();
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: 'audit-user-42',
        }),
      );
    });
  });

  describe('setOpeningStock', () => {
    it('should call RPC set_opening_stock', async () => {
      supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null });

      await service.setOpeningStock('t1', 'ing-1', 50);

      expect(supabase.rpc).toHaveBeenCalledWith('set_opening_stock', {
        p_tenant_id: 't1',
        p_ingredient_id: 'ing-1',
        p_quantity: 50,
      });
    });
  });

  // ─── Stock Status & Movements ─────────────────────────

  describe('getStockStatus', () => {
    it('should call RPC get_stock_status', async () => {
      const mockStatus = [
        { id: 'ing-1', name: 'Farine', current_stock: 10, is_low: false },
        { id: 'ing-2', name: 'Sel', current_stock: 1, is_low: true },
      ];
      supabase.rpc = vi.fn().mockResolvedValue({ data: mockStatus, error: null });

      const result = await service.getStockStatus('t1');

      expect(supabase.rpc).toHaveBeenCalledWith('get_stock_status', {
        p_tenant_id: 't1',
      });
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getStockMovements', () => {
    it('should apply filters (ingredientId, date range)', async () => {
      const mockMovements = [
        { id: 'mv-1', ingredient_id: 'ing-1', movement_type: 'manual_add', quantity: 5 },
      ];

      // Build the full chain: .from().select().eq().order().limit() then optional .eq().gte().lte()
      const lteFn = vi.fn().mockResolvedValue({ data: mockMovements, error: null });
      const gteFn = vi.fn().mockReturnValue({ lte: lteFn });
      const eqIngredient = vi.fn().mockReturnValue({ gte: gteFn });
      const limitFn = vi.fn().mockReturnValue({ eq: eqIngredient });
      const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
      const eqTenant = vi.fn().mockReturnValue({ order: orderFn });
      const selectFn = vi.fn().mockReturnValue({ eq: eqTenant });
      supabase.from = vi.fn().mockReturnValue({ select: selectFn });

      const result = await service.getStockMovements('t1', {
        ingredientId: 'ing-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(supabase.from).toHaveBeenCalledWith('stock_movements');
      expect(selectFn).toHaveBeenCalledWith(
        '*, ingredient:ingredients(name, unit), supplier:suppliers(id, name)',
      );
      expect(eqTenant).toHaveBeenCalledWith('tenant_id', 't1');
      expect(orderFn).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(limitFn).toHaveBeenCalledWith(200);
      expect(eqIngredient).toHaveBeenCalledWith('ingredient_id', 'ing-1');
      expect(gteFn).toHaveBeenCalledWith('created_at', '2026-01-01');
      expect(lteFn).toHaveBeenCalledWith('created_at', '2026-01-31');
      expect(result).toEqual(mockMovements);
    });
  });
});
