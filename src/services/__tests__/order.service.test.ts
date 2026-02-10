import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderService } from '../order.service';
import { ServiceError } from '../errors';
import type { OrderItemInput } from '@/lib/validations/order.schema';

// Mock the logger to avoid Sentry imports in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

/**
 * Helper to build a mock Supabase client with fine-grained control.
 */
function createMockSupabase() {
  // Chain tracking for different tables
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  function getChain(table: string) {
    if (!chains[table]) {
      chains[table] = {
        select: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        single: vi.fn(),
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: chain.single,
          in: chain.in,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: chain.single,
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });

  return {
    from: mockFrom,
    _chains: chains,
    _getChain: getChain,
  };
}

/** Cast mock to SupabaseClient for the service factory */
function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

/** Build a minimal OrderItemInput for tests */
function makeItem(
  overrides: Partial<OrderItemInput> & {
    id: string;
    name: string;
    price: number;
    quantity: number;
  },
): OrderItemInput[] {
  return [{ ...overrides }] as OrderItemInput[];
}

describe('OrderService', () => {
  describe('validateTenant', () => {
    it('should return tenant id when tenant exists and is active', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('tenants').single.mockResolvedValue({
        data: { id: 'tenant-123', is_active: true },
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const result = await service.validateTenant('my-restaurant');

      expect(result).toEqual({ id: 'tenant-123' });
    });

    it('should throw NOT_FOUND when tenant does not exist', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('tenants').single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const service = createOrderService(asSupabase(supabase));

      await expect(service.validateTenant('unknown')).rejects.toThrow(ServiceError);
      await expect(service.validateTenant('unknown')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw VALIDATION when tenant is inactive', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('tenants').single.mockResolvedValue({
        data: { id: 'tenant-123', is_active: false },
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      await expect(service.validateTenant('inactive-restaurant')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });
  });

  describe('validateOrderItems', () => {
    it('should calculate total correctly for valid items', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [
          { id: 'item-1', name: 'Pizza', price: 10, is_available: true },
          { id: 'item-2', name: 'Pasta', price: 8, is_available: true },
        ],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      const items = [
        { id: 'item-1', name: 'Pizza', price: 10, quantity: 2 },
        { id: 'item-2', name: 'Pasta', price: 8, quantity: 1 },
      ] as OrderItemInput[];

      const result = await service.validateOrderItems('tenant-123', items);
      expect(result.validatedTotal).toBe(28); // 10*2 + 8*1
    });

    it('should throw VALIDATION when an item is not found', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-999', name: 'Ghost Item', price: 10, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should throw VALIDATION when an item is unavailable', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: false }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-1', name: 'Pizza', price: 10, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should throw VALIDATION when price mismatch exceeds 1% tolerance', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      // Client sends price 12 but server has 10 — >1% difference
      const items = makeItem({ id: 'item-1', name: 'Pizza', price: 12, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should accept price within 1% tolerance', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      // Client sends 10.05 for a 10.00 item — within 1% (0.10)
      const items = makeItem({ id: 'item-1', name: 'Pizza', price: 10.05, quantity: 1 });

      const result = await service.validateOrderItems('tenant-123', items);
      expect(result.validatedTotal).toBeCloseTo(10.05);
    });

    it('should use variant price when selectedVariant is present', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      // Item with variant at a different price
      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 15,
          quantity: 1,
          selectedVariant: { name_fr: 'Grande', price: 15 },
        },
      ] as OrderItemInput[];

      const result = await service.validateOrderItems('tenant-123', items);
      expect(result.validatedTotal).toBe(15);
    });

    it('should throw VALIDATION when total is zero', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Free Item', price: 0, is_available: true }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-1', name: 'Free Item', price: 0, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should throw INTERNAL when menu query fails', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-1', name: 'Pizza', price: 10, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate a number starting with CMD- via RPC', async () => {
      const supabase = createMockSupabase();
      // Mock the rpc call for next_order_number
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi.fn().mockResolvedValue({
        data: 'CMD-20260210-001',
        error: null,
      });
      const service = createOrderService(asSupabase(supabase));

      const orderNumber = await service.generateOrderNumber('tenant-123');
      expect(orderNumber).toMatch(/^CMD-/);
    });

    it('should fallback to timestamp-based when RPC fails', async () => {
      const supabase = createMockSupabase();
      // Mock the rpc call to fail
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'RPC not available' },
      });
      const service = createOrderService(asSupabase(supabase));

      const orderNumber = await service.generateOrderNumber('tenant-123');
      expect(orderNumber).toMatch(/^CMD-[A-Z0-9]+$/);
    });

    it('should generate unique numbers on successive calls', async () => {
      const supabase = createMockSupabase();
      let callCount = 0;
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi
        .fn()
        .mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            data: `CMD-20260210-${String(callCount).padStart(3, '0')}`,
            error: null,
          });
        });
      const service = createOrderService(asSupabase(supabase));

      const num1 = await service.generateOrderNumber('tenant-123');
      const num2 = await service.generateOrderNumber('tenant-123');

      expect(num1).toMatch(/^CMD-/);
      expect(num2).toMatch(/^CMD-/);
      expect(num1).not.toBe(num2);
    });
  });
});
