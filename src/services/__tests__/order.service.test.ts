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

    it('should price a variant by id even when the name no longer matches (H4)', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({ data: [], error: null });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [{ id: 'var-1', menu_item_id: 'item-1', variant_name_fr: 'Grande', price: 15 }],
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));
      // The variant was renamed since the cart was built: name will not match, but
      // the id still does, so the server resolves the correct price by id.
      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 15,
          quantity: 1,
          selectedVariant: { id: 'var-1', name_fr: 'Ancien Nom', price: 15 },
        },
      ] as OrderItemInput[];

      const result = await service.validateOrderItems('tenant-123', items);
      expect(result.validatedTotal).toBe(15);
    });

    it('should price a modifier by id even when the name no longer matches (H4)', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [{ id: 'mod-1', menu_item_id: 'item-1', name: 'Extra Cheese', price: 3 }],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({ data: [], error: null });

      const service = createOrderService(asSupabase(supabase));
      const items = [
        {
          id: 'item-1',
          name: 'Pizza',
          price: 10,
          quantity: 1,
          // Stale name, correct id -> server resolves price by id.
          modifiers: [{ id: 'mod-1', name: 'Renomme', price: 0 }],
        },
      ] as OrderItemInput[];

      const result = await service.validateOrderItems('tenant-123', items);
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

  describe('markPaid (idempotency guard)', () => {
    // Bespoke mock for the update().eq().eq().eq().select() chain.
    function makeSupabase(selectResult: { data?: unknown; error?: unknown }) {
      const update = vi.fn();
      const select = vi.fn().mockResolvedValue(selectResult);
      const eq3 = vi.fn().mockReturnValue({ select });
      const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      update.mockReturnValue({ eq: eq1 });
      const paymentsInsert = vi.fn().mockResolvedValue({ error: null });
      const from = vi.fn((table: string) => {
        if (table === 'payments') return { insert: paymentsInsert };
        return { update };
      });
      return {
        client: { from } as unknown as SupabaseClient,
        update,
        eq1,
        eq2,
        eq3,
        select,
        paymentsInsert,
      };
    }

    it('scopes the update to payment_status=pending and returns paid:true when a row flips', async () => {
      const m = makeSupabase({
        data: [{ id: 'order-1', total: 1000, tip_amount: 500 }],
        error: null,
      });
      const service = createOrderService(m.client);

      const res = await service.markPaid('order-1', 'tenant-123', {
        method: 'cash',
        tipAmount: 500,
      });

      expect(res).toEqual({ paid: true });
      // payment_status='pending' guard present (third .eq)
      expect(m.eq3).toHaveBeenCalledWith('payment_status', 'pending');
      // tip recorded when > 0
      expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ tip_amount: 500 }));
      // a tender is appended to the ledger (audit H2/H8) with amount = total + tip
      expect(m.paymentsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'order-1',
          method: 'cash',
          status: 'completed',
          amount: 1500,
        }),
      );
    });

    it('is a no-op (paid:false) on an already-paid order (0 rows matched)', async () => {
      const m = makeSupabase({ data: [], error: null });
      const service = createOrderService(m.client);

      const res = await service.markPaid('order-1', 'tenant-123', { method: 'cash' });

      expect(res).toEqual({ paid: false });
    });

    it('does not record a zero tip', async () => {
      const m = makeSupabase({ data: [{ id: 'order-1' }], error: null });
      const service = createOrderService(m.client);

      await service.markPaid('order-1', 'tenant-123', { method: 'cash', tipAmount: 0 });

      expect(m.update).toHaveBeenCalledWith(expect.not.objectContaining({ tip_amount: 0 }));
    });

    it('throws INTERNAL on database error', async () => {
      const m = makeSupabase({ data: null, error: { message: 'DB error' } });
      const service = createOrderService(m.client);

      await expect(
        service.markPaid('order-1', 'tenant-123', { method: 'cash' }),
      ).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  describe('markPaid - table session closing (C1)', () => {
    // Multi-table mock: orders.update().eq().eq().eq().select() returns a paid row
    // with a session; orders.select(count).eq().eq().eq().neq() returns the number
    // of still-unpaid orders on the session; table_sessions.update().eq().eq().eq().
    function makeSupabase(remainingUnpaid: number) {
      const tsUpdateEq3 = vi.fn().mockResolvedValue({ error: null });
      const tsUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: tsUpdateEq3 }) }),
      });

      const countNeq = vi.fn().mockResolvedValue({ count: remainingUnpaid, error: null });
      const ordersSelectCount = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: countNeq }) }),
        }),
      });

      const updateSelect = vi
        .fn()
        .mockResolvedValue({ data: [{ id: 'o1', session_id: 's1' }], error: null });
      const ordersUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: updateSelect }) }),
        }),
      });

      const from = vi.fn((table: string) => {
        if (table === 'orders') return { update: ordersUpdate, select: ordersSelectCount };
        if (table === 'table_sessions') return { update: tsUpdate };
        if (table === 'payments') return { insert: vi.fn().mockResolvedValue({ error: null }) };
        return {};
      });
      return { client: { from } as unknown as SupabaseClient, tsUpdate };
    }

    it('closes the session when no unpaid orders remain', async () => {
      const m = makeSupabase(0);
      const service = createOrderService(m.client);

      const res = await service.markPaid('o1', 't1', { method: 'cash' });

      expect(res).toEqual({ paid: true });
      expect(m.tsUpdate).toHaveBeenCalledWith({ status: 'closed', closed_at: expect.any(String) });
    });

    it('keeps the session open while other orders are unpaid', async () => {
      const m = makeSupabase(1);
      const service = createOrderService(m.client);

      await service.markPaid('o1', 't1', { method: 'cash' });

      expect(m.tsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus (forward-only state machine + optimistic concurrency, H13)', () => {
    function makeSupabase(currentStatus: string | null, updateRows: unknown[] = [{ id: 'o1' }]) {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: currentStatus === null ? null : { status: currentStatus },
        error: null,
      });
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      });
      const updateSelect = vi.fn().mockResolvedValue({ data: updateRows, error: null });
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: updateSelect }) }),
        }),
      });
      const from = vi.fn().mockReturnValue({ select, update });
      return { client: { from } as unknown as SupabaseClient, update };
    }

    it('allows a forward transition (preparing -> ready)', async () => {
      const m = makeSupabase('preparing', [{ id: 'o1' }]);
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).resolves.toBeUndefined();
      expect(m.update).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('is a no-op when the status is unchanged', async () => {
      const m = makeSupabase('ready');
      const service = createOrderService(m.client);
      await service.updateStatus('o1', 't1', 'ready');
      expect(m.update).not.toHaveBeenCalled();
    });

    it('rejects a backward transition (ready -> preparing)', async () => {
      const m = makeSupabase('ready');
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'preparing')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(m.update).not.toHaveBeenCalled();
    });

    it('rejects transitioning a finalised (delivered) order', async () => {
      const m = makeSupabase('delivered');
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('throws CONFLICT when another device advanced it first (0 rows)', async () => {
      const m = makeSupabase('preparing', []); // read preparing, but conditional update matched nothing
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('throws NOT_FOUND when the order does not exist', async () => {
      const m = makeSupabase(null);
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('setCourseHeld (fire/hold a course)', () => {
    function makeSupabase(error: unknown = null) {
      const eq3 = vi.fn().mockResolvedValue({ error });
      const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const update = vi.fn().mockReturnValue({ eq: eq1 });
      const from = vi.fn().mockReturnValue({ update });
      return { client: { from } as unknown as SupabaseClient, update, eq3 };
    }

    it('holds a course (held=true, no fired_at)', async () => {
      const m = makeSupabase();
      const service = createOrderService(m.client);
      await service.setCourseHeld('o1', 't1', 'dessert', true);
      expect(m.update).toHaveBeenCalledWith({ held: true });
      expect(m.eq3).toHaveBeenCalledWith('course', 'dessert');
    });

    it('fires a course (held=false + fired_at)', async () => {
      const m = makeSupabase();
      const service = createOrderService(m.client);
      await service.setCourseHeld('o1', 't1', 'main', false);
      expect(m.update).toHaveBeenCalledWith(
        expect.objectContaining({ held: false, fired_at: expect.any(String) }),
      );
    });

    it('throws INTERNAL on DB error', async () => {
      const m = makeSupabase({ message: 'boom' });
      const service = createOrderService(m.client);
      await expect(service.setCourseHeld('o1', 't1', 'main', true)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  describe('cancelOrder (reverses side-effects)', () => {
    // Mock: from('orders').select().eq().eq().maybeSingle() for the fetch,
    // rpc() for restock/unclaim, from('orders').update().eq().eq() for the flip.
    function makeSupabase(opts: {
      order: Record<string, unknown> | null;
      fetchError?: unknown;
      restockError?: unknown;
      unclaimError?: unknown;
      updateError?: unknown;
    }) {
      const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: opts.order, error: opts.fetchError ?? null });
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      });
      const updateEq2 = vi.fn().mockResolvedValue({ error: opts.updateError ?? null });
      const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: updateEq2 }) });
      const rpc = vi.fn().mockImplementation((name: string) => {
        if (name === 'restock_order') return Promise.resolve({ error: opts.restockError ?? null });
        if (name === 'unclaim_coupon_usage')
          return Promise.resolve({ error: opts.unclaimError ?? null });
        return Promise.resolve({ error: null });
      });
      const from = vi.fn().mockReturnValue({ select, update });
      return { client: { from, rpc } as unknown as SupabaseClient, rpc, update };
    }

    it('unclaims the coupon then marks cancelled (restock handled by the caller)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'pending', coupon_id: 'c1' },
      });
      const service = createOrderService(m.client);

      await service.cancelOrder('o1', 'tenant-123');

      // restock is NOT done here - it goes through the service_role path in the action.
      expect(m.rpc).not.toHaveBeenCalledWith('restock_order', expect.anything());
      expect(m.rpc).toHaveBeenCalledWith('unclaim_coupon_usage', { p_coupon_id: 'c1' });
      expect(m.update).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('does not unclaim when the order has no coupon', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'ready', payment_status: 'pending', coupon_id: null },
      });
      const service = createOrderService(m.client);

      await service.cancelOrder('o1', 'tenant-123');

      expect(m.rpc).not.toHaveBeenCalledWith('unclaim_coupon_usage', expect.anything());
      expect(m.update).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('is a no-op when the order is already cancelled', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'cancelled', payment_status: 'pending', coupon_id: 'c1' },
      });
      const service = createOrderService(m.client);

      await service.cancelOrder('o1', 'tenant-123');

      expect(m.rpc).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    });

    it('refuses to cancel a paid order (CONFLICT)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'delivered', payment_status: 'paid', coupon_id: null },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when the order does not exist', async () => {
      const m = makeSupabase({ order: null });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
