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
        maybeSingle: vi.fn(),
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    const inMock = chain.in;
    const isMock = vi.fn().mockReturnValue({ in: inMock, single: chain.single });
    const eqMock = vi.fn().mockReturnValue({
      single: chain.single,
      maybeSingle: chain.maybeSingle,
      in: inMock,
      is: isMock,
      eq: vi.fn().mockReturnValue({
        single: chain.single,
        maybeSingle: chain.maybeSingle,
        is: isMock,
      }),
    });

    return {
      select: vi.fn().mockReturnValue({
        eq: eqMock,
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

/** Set up item_modifiers and item_price_variants mocks to return empty */
function mockNoModifiers(supabase: ReturnType<typeof createMockSupabase>) {
  supabase._getChain('item_modifiers').in.mockResolvedValue({
    data: [],
    error: null,
  });
  supabase._getChain('item_price_variants').in.mockResolvedValue({
    data: [],
    error: null,
  });
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

      expect(result.id).toBe('tenant-123');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('tax_rate');
      expect(result).toHaveProperty('subscription_plan');
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

  describe('previewOrderItems', () => {
    it('returns invalidItemIds when menu item is missing', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [],
        error: null,
      });
      mockNoModifiers(supabase);

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-999', name: 'Ghost Item', price: 10, quantity: 1 });

      const preview = await service.previewOrderItems('tenant-123', items);
      expect(preview.valid).toBe(false);
      expect(preview.invalidItemIds).toEqual(['item-999']);
      expect(preview.issues[0]?.removeFromCart).toBe(true);
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
      mockNoModifiers(supabase);

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
      mockNoModifiers(supabase);

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
      mockNoModifiers(supabase);

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
      mockNoModifiers(supabase);

      const service = createOrderService(asSupabase(supabase));

      // Client sends price 12 but server has 10 - >1% difference
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
      mockNoModifiers(supabase);

      const service = createOrderService(asSupabase(supabase));

      // Client sends 10.05 for a 10.00 item - within 1% (0.10)
      const items = makeItem({ id: 'item-1', name: 'Pizza', price: 10.05, quantity: 1 });

      const result = await service.validateOrderItems('tenant-123', items);
      // Now uses server price (10), not client price (10.05)
      expect(result.validatedTotal).toBe(10);
    });

    it('should use variant price from DB when selectedVariant is present', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [{ id: 'var-1', menu_item_id: 'item-1', variant_name_fr: 'Grande', price: 15 }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      // Item with variant - server DB price is 15
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

    it('should reject unknown variant', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 1,
          quantity: 1,
          selectedVariant: { name_fr: 'FakeVariant', price: 1 },
        },
      ] as OrderItemInput[];

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should throw VALIDATION when total is zero', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Free Item', price: 0, is_available: true }],
        error: null,
      });
      mockNoModifiers(supabase);

      const service = createOrderService(asSupabase(supabase));
      const items = makeItem({ id: 'item-1', name: 'Free Item', price: 0, quantity: 1 });

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('should verify modifier prices from server and use them in total', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [{ id: 'mod-1', menu_item_id: 'item-1', name: 'Extra Cheese', price: 3 }],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 10,
          quantity: 1,
          modifiers: [{ name: 'Extra Cheese', price: 0 }], // Client sends 0, server has 3
        },
      ] as OrderItemInput[];

      const result = await service.validateOrderItems('tenant-123', items);
      // Uses server price: 10 (item) + 3 (modifier) = 13
      expect(result.validatedTotal).toBe(13);
    });

    it('should reject unknown modifiers', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 10,
          quantity: 1,
          modifiers: [{ name: 'Fake Modifier', price: -500 }],
        },
      ] as OrderItemInput[];

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

  describe('findOrderByClientRequestId (idempotency)', () => {
    it('returns the existing order when the key was already used', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('orders').maybeSingle.mockResolvedValue({
        data: { id: 'order-1', order_number: 'CMD-1', total: 42 },
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      const result = await service.findOrderByClientRequestId('tenant-123', 'key-abc');

      expect(result).toEqual({ orderId: 'order-1', orderNumber: 'CMD-1', total: 42 });
    });

    it('returns null when the key has never been used', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('orders').maybeSingle.mockResolvedValue({ data: null, error: null });

      const service = createOrderService(asSupabase(supabase));
      const result = await service.findOrderByClientRequestId('tenant-123', 'key-new');

      expect(result).toBeNull();
    });

    it('throws INTERNAL on a lookup error', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('orders').maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'db down' },
      });

      const service = createOrderService(asSupabase(supabase));
      await expect(service.findOrderByClientRequestId('tenant-123', 'key-x')).rejects.toMatchObject(
        { code: 'INTERNAL' },
      );
    });
  });

  describe('createOrderWithItems (idempotency key)', () => {
    it('forwards the client_request_id to the create RPC', async () => {
      const supabase = createMockSupabase();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-9', error: null }) // generateOrderNumber
        .mockResolvedValueOnce({
          data: { orderId: 'order-9', orderNumber: 'CMD-9', total: 10 },
          error: null,
        }); // create_order_with_items
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      const result = await service.createOrderWithItems({
        tenantId: 'tenant-123',
        items: [{ id: 'item-1', name: 'Pizza', price: 10, quantity: 1 }] as OrderItemInput[],
        total: 10,
        clientRequestId: 'key-123',
      });

      expect(result.orderId).toBe('order-9');
      expect(result.deduplicated).toBe(false);
      expect(rpc).toHaveBeenLastCalledWith(
        'create_order_with_items',
        expect.objectContaining({ p_client_request_id: 'key-123' }),
      );
    });

    it('surfaces deduplicated:true when the RPC returns an existing order (concurrent replay)', async () => {
      const supabase = createMockSupabase();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-7', error: null }) // generateOrderNumber
        .mockResolvedValueOnce({
          data: { orderId: 'order-7', orderNumber: 'CMD-7', total: 20, deduplicated: true },
          error: null,
        }); // create_order_with_items -> deduped at unique index
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      const result = await service.createOrderWithItems({
        tenantId: 'tenant-123',
        items: [{ id: 'item-1', name: 'Pizza', price: 20, quantity: 1 }] as OrderItemInput[],
        total: 20,
        clientRequestId: 'key-dup',
      });

      expect(result.orderId).toBe('order-7');
      expect(result.deduplicated).toBe(true);
    });

    it('passes null when no idempotency key is provided', async () => {
      const supabase = createMockSupabase();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-8', error: null })
        .mockResolvedValueOnce({
          data: { orderId: 'order-8', orderNumber: 'CMD-8', total: 5 },
          error: null,
        });
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      await service.createOrderWithItems({
        tenantId: 'tenant-123',
        items: [{ id: 'item-1', name: 'Pizza', price: 5, quantity: 1 }] as OrderItemInput[],
        total: 5,
      });

      expect(rpc).toHaveBeenLastCalledWith(
        'create_order_with_items',
        expect.objectContaining({ p_client_request_id: null }),
      );
    });
  });
});
