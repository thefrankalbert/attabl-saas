import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryService } from '../inventory.service';

// Mock the logger to avoid Sentry imports in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock the menu-items-query (used in other service methods, not in count methods)
vi.mock('@/lib/menu-items-query', () => ({
  withActiveMenuItems: vi.fn((q: unknown) => q),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const COUNT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = 'user-abc';

// ─── openStockCount ────────────────────────────────────────

describe('InventoryService.openStockCount', () => {
  it('passes p_created_by from getUser and returns count id', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: COUNT_ID, error: null });
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);
    const result = await service.openStockCount(TENANT_ID, { reference: 'Test' });

    expect(mockGetUser).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('open_stock_count', {
      p_tenant_id: TENANT_ID,
      p_reference: 'Test',
      p_created_by: USER_ID,
      p_ingredient_ids: null,
    });
    expect(result).toBe(COUNT_ID);
  });

  it('maps OPEN_COUNT_EXISTS error to CONFLICT ServiceError', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'OPEN_COUNT_EXISTS' } });
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.openStockCount(TENANT_ID, {})).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Un inventaire est deja ouvert',
    });
  });

  it('maps a concurrent-open unique violation (23505) to CONFLICT', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.openStockCount(TENANT_ID, {})).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('maps NO_INGREDIENTS error to VALIDATION ServiceError', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'NO_INGREDIENTS' } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.openStockCount(TENANT_ID, {})).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

// ─── commitStockCount ─────────────────────────────────────

describe('InventoryService.commitStockCount', () => {
  it('returns number of movements created', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 7, error: null });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);
    const result = await service.commitStockCount(TENANT_ID, COUNT_ID);

    expect(result).toBe(7);
    expect(mockRpc).toHaveBeenCalledWith('commit_stock_count', {
      p_tenant_id: TENANT_ID,
      p_count_id: COUNT_ID,
      p_committed_by: USER_ID,
    });
  });

  it('maps COUNT_ALREADY_CLOSED to CONFLICT ServiceError', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'COUNT_ALREADY_CLOSED' } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.commitStockCount(TENANT_ID, COUNT_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('maps COUNT_NOT_FOUND to NOT_FOUND ServiceError', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'COUNT_NOT_FOUND' } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.commitStockCount(TENANT_ID, COUNT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── saveStockCountLines ─────────────────────────────────

describe('InventoryService.saveStockCountLines', () => {
  const LINES = [
    { ingredient_id: '00000000-0000-0000-0000-000000000010', counted_qty: 5 },
    { ingredient_id: '00000000-0000-0000-0000-000000000011', counted_qty: null },
  ];

  it('serializes lines array and calls rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);
    await service.saveStockCountLines(TENANT_ID, COUNT_ID, LINES);

    expect(mockRpc).toHaveBeenCalledWith('save_stock_count_lines', {
      p_tenant_id: TENANT_ID,
      p_count_id: COUNT_ID,
      p_lines: LINES,
    });
  });

  it('maps INVALID_COUNTED_QTY to VALIDATION ServiceError', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'INVALID_COUNTED_QTY' } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.saveStockCountLines(TENANT_ID, COUNT_ID, LINES)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('maps COUNT_NOT_FOUND to NOT_FOUND ServiceError', async () => {
    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'COUNT_NOT_FOUND' } });
    const supabase = {
      rpc: mockRpc,
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.saveStockCountLines(TENANT_ID, COUNT_ID, LINES)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ─── getStockCount ────────────────────────────────────────

describe('InventoryService.getStockCount', () => {
  it('throws NOT_FOUND when count does not exist', async () => {
    // maybeSingle resolves with null data => not found
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqIdFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
    const eqTenantFn = vi.fn().mockReturnValue({ eq: eqIdFn });
    const selectFn = vi.fn().mockReturnValue({ eq: eqTenantFn });
    const fromFn = vi.fn().mockReturnValue({ select: selectFn });

    const supabase = {
      from: fromFn,
      rpc: vi.fn(),
      auth: { getUser: vi.fn() },
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);

    await expect(service.getStockCount(TENANT_ID, COUNT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(fromFn).toHaveBeenCalledWith('stock_counts');
    expect(eqTenantFn).toHaveBeenCalledWith('id', COUNT_ID);
  });

  it('filters lines by tenant_id', async () => {
    const mockCount = {
      id: COUNT_ID,
      tenant_id: TENANT_ID,
      status: 'open',
      reference: 'Test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: USER_ID,
      committed_by: null,
      committed_at: null,
    };

    const LINES = [
      {
        id: 'l1',
        ingredient_id: 'ing-1',
        theoretical_qty: 10,
        counted_qty: null,
        ingredient: { name: 'Beurre', unit: 'kg' },
      },
      {
        id: 'l2',
        ingredient_id: 'ing-2',
        theoretical_qty: 5,
        counted_qty: 3,
        ingredient: { name: 'Ail', unit: 'g' },
      },
    ];

    // First call: stock_counts table
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: mockCount, error: null });
    const eqIdFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
    const eqTenantCountFn = vi.fn().mockReturnValue({ eq: eqIdFn });
    const selectCountFn = vi.fn().mockReturnValue({ eq: eqTenantCountFn });

    // Second call: stock_count_lines table
    const eqTenantLinesFn = vi.fn().mockResolvedValue({ data: LINES, error: null });
    const eqCountIdFn = vi.fn().mockReturnValue({ eq: eqTenantLinesFn });
    const selectLinesFn = vi.fn().mockReturnValue({ eq: eqCountIdFn });

    let callCount = 0;
    const fromFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { select: selectCountFn };
      return { select: selectLinesFn };
    });

    const supabase = {
      from: fromFn,
      rpc: vi.fn(),
      auth: { getUser: vi.fn() },
    } as unknown as SupabaseClient;

    const service = createInventoryService(supabase);
    const result = await service.getStockCount(TENANT_ID, COUNT_ID);

    expect(result.count).toEqual(mockCount);
    // Lines should be sorted by ingredient name (Ail before Beurre)
    expect(result.lines[0].ingredient?.name).toBe('Ail');
    expect(result.lines[1].ingredient?.name).toBe('Beurre');
    // Verify tenant filter was applied on lines
    expect(eqTenantLinesFn).toHaveBeenCalledWith('tenant_id', TENANT_ID);
  });
});
