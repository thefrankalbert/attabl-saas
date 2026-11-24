import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOrderService } from '../order.service';
import { STALE_PAID_ORDER_MS } from '../order/order-lifecycle';
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
        // F6: validateTenant exige desormais un statut d'abonnement entitlant,
        // pas seulement is_active - le cron de gel laissait is_active a true.
        data: { id: 'tenant-123', is_active: true, subscription_status: 'active' },
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

    // CTR7-1: une suspension decidee par le super-admin ne s'exprimait en base
    // que par is_active=false. `suspended_at` etait ecrit et affiche dans la
    // console plateforme, mais applique NULLE PART - alors que cinq ecritures du
    // webhook Stripe remettent is_active a true en se basant sur le seul statut
    // d'abonnement. La ligne ci-dessous (is_active=true + suspended_at pose) est
    // exactement celle que cette fuite produisait: la prise de commande doit la
    // refuser quand meme.
    it('refuse les commandes d un tenant suspendu par la plateforme', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('tenants').single.mockResolvedValue({
        data: {
          id: 'tenant-123',
          is_active: true,
          subscription_status: 'active',
          suspended_at: '2026-11-01T10:00:00.000Z',
        },
        error: null,
      });

      const service = createOrderService(asSupabase(supabase));

      await expect(service.validateTenant('suspended-restaurant')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
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

    // Le secours ne refuse pas la commande - un service en salle ne s'arrete pas
    // pour un numero - mais le numero rendu n'appartient PAS a la sequence, et
    // il doit le DIRE. Sept commandes du 2026-05-02 portaient un numero de
    // secours indiscernable d'un numero legitime; le prefixe `CMD-HS-` le rend
    // visible en comptabilite.
    it.each([
      ['la RPC rend une erreur', { data: null, error: { message: 'RPC not available' } }],
      ['la RPC rend un resultat vide', { data: null, error: null }],
    ])('marque le numero HORS SEQUENCE quand %s', async (_nom, reponse) => {
      const supabase = createMockSupabase();
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi
        .fn()
        .mockResolvedValue(reponse);
      const service = createOrderService(asSupabase(supabase));

      const orderNumber = await service.generateOrderNumber('tenant-123');
      expect(orderNumber).toMatch(/^CMD-HS-[A-Z0-9]+$/);
    });

    it('marque aussi HORS SEQUENCE quand l appel RPC jette', async () => {
      const supabase = createMockSupabase();
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi
        .fn()
        .mockRejectedValue(new Error('reseau coupe'));
      const service = createOrderService(asSupabase(supabase));

      await expect(service.generateOrderNumber('tenant-123')).resolves.toMatch(/^CMD-HS-/);
    });

    // Un numero de la sequence ne doit JAMAIS porter la marque du secours: sans
    // ce cas, prefixer tous les numeros passerait les tests ci-dessus.
    it('un numero rendu par la sequence ne porte PAS la marque HS', async () => {
      const supabase = createMockSupabase();
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi.fn().mockResolvedValue({
        data: 'CMD-20261107-004',
        error: null,
      });
      const service = createOrderService(asSupabase(supabase));

      const orderNumber = await service.generateOrderNumber('tenant-123');
      expect(orderNumber).toBe('CMD-20261107-004');
      expect(orderNumber).not.toContain('CMD-HS-');
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

  describe('libelles verifies serveur (intrusion P-01)', () => {
    it('enregistre le nom de la carte, pas celui envoye par le client', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Eau', name_en: 'Water', price: 500, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [{ id: 'mod-1', menu_item_id: 'item-1', name: 'Glacons', price: 0 }],
        error: null,
      });
      supabase._getChain('item_price_variants').in.mockResolvedValue({
        data: [{ id: 'var-1', menu_item_id: 'item-1', variant_name_fr: 'Petite', price: 500 }],
        error: null,
      });
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-1', error: null })
        .mockResolvedValueOnce({
          data: { orderId: 'order-1', orderNumber: 'CMD-1', total: 500 },
          error: null,
        });
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      // Le convive paie l'eau mais envoie des libelles forges.
      const items = [
        {
          id: 'item-1',
          name: 'COTE DE BOEUF 1KG',
          name_en: 'RIBEYE',
          price: 500,
          quantity: 1,
          modifiers: [{ id: 'mod-1', name: 'DOUBLE PORTION', price: 15000 }],
          selectedVariant: { id: 'var-1', name_fr: 'GRAND FORMAT', price: 500 },
        },
      ] as OrderItemInput[];

      const { verifiedPrices, verifiedLabels } = await service.validateOrderItems(
        'tenant-123',
        items,
      );
      await service.createOrderWithItems({
        tenantId: 'tenant-123',
        items,
        total: 500,
        display_currency: 'XAF',
        verifiedPrices,
        verifiedLabels,
      });

      const sent = rpc.mock.calls.at(-1)?.[1] as { p_items: Record<string, unknown>[] };
      expect(sent.p_items[0]).toMatchObject({
        item_name: 'Eau',
        item_name_en: 'Water',
        customer_notes: 'Petite',
        modifiers: [{ id: 'mod-1', name: 'Glacons', price: 0 }],
      });
      expect(JSON.stringify(sent.p_items)).not.toMatch(/BOEUF|DOUBLE PORTION|GRAND FORMAT|15000/);
    });

    it('refuse un supplement retire de la vente', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('menu_items').in.mockResolvedValue({
        data: [{ id: 'item-1', name: 'Pizza', price: 10, is_available: true }],
        error: null,
      });
      supabase._getChain('item_modifiers').in.mockResolvedValue({
        data: [
          { id: 'mod-1', menu_item_id: 'item-1', name: 'Truffe', price: 3, is_available: false },
        ],
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
          modifiers: [{ id: 'mod-1', name: 'Truffe', price: 3 }],
        },
      ] as OrderItemInput[];

      await expect(service.validateOrderItems('tenant-123', items)).rejects.toThrow();
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
        // F2: la devise de comptabilisation est desormais obligatoire sur ce
        // chemin - un repli silencieux sur XAF etait une erreur d'un facteur 100.
        display_currency: 'XAF',
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
        display_currency: 'XAF',
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
        display_currency: 'XAF',
      });

      expect(rpc).toHaveBeenLastCalledWith(
        'create_order_with_items',
        expect.objectContaining({ p_client_request_id: null }),
      );
    });

    it('converts EUR amounts to integer minor units before the RPC (12.50 -> 1250)', async () => {
      const supabase = createMockSupabase();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-EUR', error: null }) // generateOrderNumber
        .mockResolvedValueOnce({
          data: { orderId: 'order-eur', orderNumber: 'CMD-EUR', total: 1250 },
          error: null,
        }); // create_order_with_items
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      const result = await service.createOrderWithItems({
        tenantId: 'tenant-eur',
        display_currency: 'EUR',
        items: [{ id: 'item-1', name: 'Pizza', price: 12.5, quantity: 1 }] as OrderItemInput[],
        total: 12.5,
        subtotal: 10,
        tax_amount: 2,
        service_charge_amount: 0.5,
        discount_amount: 0,
        tip_amount: 1.25,
      });

      // Returned total is the minor integer the DB stored.
      expect(result.total).toBe(1250);
      // Every transactional money field is converted to minor (x100 for EUR).
      const [, args] = rpc.mock.calls[rpc.mock.calls.length - 1] as [
        string,
        Record<string, unknown>,
      ];
      expect(args.p_total).toBe(1250);
      expect(args.p_subtotal).toBe(1000);
      expect(args.p_tax_amount).toBe(200);
      expect(args.p_service_charge_amount).toBe(50);
      expect(args.p_discount_amount).toBe(0);
      expect(args.p_tip_amount).toBe(125);
      const items = args.p_items as Array<{ price_at_order: number }>;
      expect(items[0].price_at_order).toBe(1250);
    });

    it('keeps XAF amounts identical (zero-decimal: 1000 -> 1000)', async () => {
      const supabase = createMockSupabase();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: 'CMD-XAF', error: null })
        .mockResolvedValueOnce({
          data: { orderId: 'order-xaf', orderNumber: 'CMD-XAF', total: 1000 },
          error: null,
        });
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = rpc;

      const service = createOrderService(asSupabase(supabase));
      await service.createOrderWithItems({
        tenantId: 'tenant-xaf',
        display_currency: 'XAF',
        items: [{ id: 'item-1', name: 'Riz', price: 1000, quantity: 1 }] as OrderItemInput[],
        total: 1000,
        tip_amount: 500,
      });

      const [, args] = rpc.mock.calls[rpc.mock.calls.length - 1] as [
        string,
        Record<string, unknown>,
      ];
      expect(args.p_total).toBe(1000);
      expect(args.p_tip_amount).toBe(500);
      const items = args.p_items as Array<{ price_at_order: number }>;
      expect(items[0].price_at_order).toBe(1000);
    });
  });

  describe('markPaid: bascule et registre en UNE transaction (encaisser_commande)', () => {
    // markPaid lit le pourboire deja enregistre (seulement s'il y a un ajout a
    // la caisse), puis appelle UNE fonction de base qui bascule la commande ET
    // ecrit la ligne du registre dans la meme transaction (migration
    // 20261120220000). Ses regles (filtres, ajout, plafond, annulation
    // automatique) sont prouvees par supabase/tests/rls/encaissement_atomique.test.sql.
    type Recorded = { tip_amount: number; display_currency: string | null; payment_status: string };
    function makeSupabase(
      rpcResult: { data?: unknown; error?: unknown } = {
        data: { paid: true, session_id: null },
        error: null,
      },
      recorded: Recorded = { tip_amount: 0, display_currency: 'XOF', payment_status: 'pending' },
    ) {
      const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<unknown>>(
        async (name) =>
          name === 'encaisser_commande' ? rpcResult : { data: 'closed', error: null },
      );
      const readEqs: unknown[][] = [];
      const update = vi.fn();
      const insert = vi.fn();
      const tipRead = vi.fn(() => ({
        eq: (...a1: unknown[]) => {
          readEqs.push(a1);
          return {
            eq: (...a2: unknown[]) => {
              readEqs.push(a2);
              return { maybeSingle: async () => ({ data: recorded, error: null }) };
            },
          };
        },
      }));
      const from = vi.fn((table: string) =>
        table === 'orders' ? { select: tipRead, update } : { insert },
      );
      return {
        client: { from, rpc } as unknown as SupabaseClient,
        rpc,
        update,
        insert,
        tipRead,
        readEqs,
      };
    }
    const payCall = (m: ReturnType<typeof makeSupabase>) =>
      m.rpc.mock.calls.find((c) => c[0] === 'encaisser_commande')?.[1] as
        Record<string, unknown> | undefined;

    // Defaut corrige (relecture adversariale du lot pourboires): les deux
    // ecritures etaient separees, et l'annulation apres un registre en echec
    // ne pouvait pas reussir pour un caissier (paid_at reecrit par la garde,
    // retour a pending refuse). Une commande restait payee sans ligne au
    // registre. Ce test echoue sur l'ancien code, qui ecrivait orders puis payments.
    it('n ecrit jamais orders ni payments directement: un seul appel transactionnel', async () => {
      const m = makeSupabase();
      const res = await createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' });
      expect(res).toEqual({ paid: true });
      expect(m.update).not.toHaveBeenCalled();
      expect(m.insert).not.toHaveBeenCalled();
      expect(payCall(m)).toEqual({
        p_order_id: 'o1',
        p_tenant_id: 't1',
        p_method: 'cash',
        p_tip_ajout: 0,
      });
    });

    it('registre refuse par la base: erreur definitive, rien d ecrit a cote', async () => {
      const m = makeSupabase({ data: null, error: { code: '22023', message: 'refuse' } });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(m.update).not.toHaveBeenCalled();
      expect(m.insert).not.toHaveBeenCalled();
    });

    it('panne passagere: Erreur interne, rejouable par la file hors ligne', async () => {
      const m = makeSupabase({ data: null, error: { code: '08006', message: 'down' } });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'INTERNAL', message: 'Erreur interne' });
    });

    it('commande deja reglee (rejeu): paid false, sans fermer la table', async () => {
      const m = makeSupabase({
        data: { paid: false, payment_status: 'paid', status: 'delivered' },
        error: null,
      });
      const res = await createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' });
      expect(res).toEqual({ paid: false });
      expect(m.rpc).not.toHaveBeenCalledWith('close_table_session_if_settled', expect.anything());
    });

    it('ferme la table une fois reglee, borne au restaurant, avec le delai de 2 h', async () => {
      const m = makeSupabase({ data: { paid: true, session_id: 's1' }, error: null });
      await createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' });
      expect(m.rpc).toHaveBeenCalledWith('close_table_session_if_settled', {
        p_session_id: 's1',
        p_tenant_id: 't1',
        p_stale_before: expect.any(String),
      });
      const closeArgs = m.rpc.mock.calls.find((c) => c[0] === 'close_table_session_if_settled')!;
      const cutoff = new Date(
        (closeArgs[1] as { p_stale_before: string }).p_stale_before,
      ).getTime();
      expect(Math.abs(Date.now() - STALE_PAID_ORDER_MS - cutoff)).toBeLessThan(5_000);
    });

    // Constat B: le pourboire de la caisse s'AJOUTE a celui du client (500 sur
    // la vitrine + 200 a la caisse = 700). Seul l'ajout part a la base, qui
    // fait la somme dans le meme UPDATE.
    it('envoie seulement l ajout de la caisse, lu sous le bon restaurant', async () => {
      const m = makeSupabase(undefined, {
        tip_amount: 500,
        display_currency: 'XOF',
        payment_status: 'pending',
      });
      await createOrderService(m.client).markPaid('o1', 't1', { method: 'cash', tipAmount: 200 });
      expect(payCall(m)).toEqual(expect.objectContaining({ p_tip_ajout: 200 }));
      expect(payCall(m)).not.toHaveProperty('p_tip_plafond');
      expect(m.readEqs).toContainEqual(['tenant_id', 't1']);
    });

    it('n envoie aucun ajout quand la caisse n ajoute rien, sans lecture', async () => {
      const m = makeSupabase();
      await createOrderService(m.client).markPaid('o1', 't1', { method: 'cash', tipAmount: 0 });
      expect(m.tipRead).not.toHaveBeenCalled();
      expect(payCall(m)).toMatchObject({ p_tip_ajout: 0 });
    });

    // Constat F: meme plafond que la route de commande, 1 000 000 en unites
    // MAJEURES de la devise, sur le pourboire obtenu.
    it('refuse un pourboire au-dela du plafond (XOF), sans appeler la base', async () => {
      const m = makeSupabase(undefined, {
        tip_amount: 500,
        display_currency: 'XOF',
        payment_status: 'pending',
      });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash', tipAmount: 999_501 }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(payCall(m)).toBeUndefined();
    });

    it('accepte le plafond exact, et le met a l echelle d une devise a 2 decimales', async () => {
      const xof = makeSupabase(undefined, {
        tip_amount: 500,
        display_currency: 'XOF',
        payment_status: 'pending',
      });
      await createOrderService(xof.client).markPaid('o1', 't1', {
        method: 'cash',
        tipAmount: 999_500,
      });
      expect(payCall(xof)).toMatchObject({ p_tip_ajout: 999_500 });

      const eur = makeSupabase(undefined, {
        tip_amount: 0,
        display_currency: 'EUR',
        payment_status: 'pending',
      });
      // 1 000 000 EUR = 100 000 000 centimes: 2 000 000 centimes passe.
      await createOrderService(eur.client).markPaid('o1', 't1', {
        method: 'cash',
        tipAmount: 2_000_000,
      });
      expect(payCall(eur)).toMatchObject({ p_tip_ajout: 2_000_000 });
    });

    // Un rejeu d'un encaissement deja passe relisait un pourboire DEJA augmente:
    // pres du plafond, il etait refuse (422 definitif) alors que la commande
    // etait payee.
    it('un rejeu sur une commande deja payee n est jamais refuse par le plafond', async () => {
      const m = makeSupabase(
        { data: { paid: false, payment_status: 'paid', status: 'delivered' }, error: null },
        { tip_amount: 999_900, display_currency: 'XOF', payment_status: 'paid' },
      );
      const res = await createOrderService(m.client).markPaid('o1', 't1', {
        method: 'cash',
        tipAmount: 200,
      });
      expect(res).toEqual({ paid: false });
      expect(payCall(m)).toMatchObject({ p_tip_ajout: 200 });
    });

    // Contre-verification du 2026-11-21: le refus de plan de la base (PR #444,
    // code 23514) etait traite comme une panne passagere: "Erreur interne" a
    // l'ecran, et la file hors ligne relancait en boucle.
    it('refus de plan (23514): refus definitif, message clair', async () => {
      const m = makeSupabase({
        data: null,
        error: { code: '23514', message: 'Tips require the Pro plan or higher' },
      });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        message: 'Pourboire non inclus dans votre plan',
      });
    });

    // Contre-verification finale: tout 23514 devenait "Pourboire non inclus
    // dans votre plan", alors que la liste des moyens de paiement leve aussi
    // 23514 (orders_payment_method_check).
    it('23514 de la liste des moyens de paiement: message propre, pas le plan', async () => {
      const m = makeSupabase({
        data: null,
        error: {
          code: '23514',
          message:
            'new row for relation "orders" violates check constraint "orders_payment_method_check"',
        },
      });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'VALIDATION', message: 'Moyen de paiement non accepte' });
    });

    it('autre 23514: refus definitif generique, jamais "Erreur interne"', async () => {
      const m = makeSupabase({ data: null, error: { code: '23514', message: 'autre regle' } });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        message: "Le paiement n'a pas pu etre enregistre",
      });
    });

    // Une commande annulee garde payment_status 'pending': elle revenait en
    // "deja reglee", et le caissier lisait qu'elle etait encaissee.
    it('commande annulee: message "annulee", pas "deja reglee"', async () => {
      const m = makeSupabase({
        data: { paid: false, payment_status: 'pending', status: 'cancelled' },
        error: null,
      });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/annulee/) });
    });

    it('commande introuvable (autre restaurant, supprimee): NOT_FOUND', async () => {
      const m = makeSupabase({
        data: { paid: false, payment_status: null, status: null },
        error: null,
      });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    // Une commande partiellement payee repondait "succes, deja reglee": le
    // caissier croyait avoir encaisse.
    it('commande partiellement payee: erreur explicite, pas un faux succes', async () => {
      const m = makeSupabase({ data: { paid: false, payment_status: 'partial' }, error: null });
      await expect(
        createOrderService(m.client).markPaid('o1', 't1', { method: 'cash' }),
      ).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/partiel/) });
    });
  });

  describe('updateStatus (forward-only state machine + optimistic concurrency, H13)', () => {
    // `statusApres` est le statut que rend la RELECTURE faite quand l'UPDATE
    // n'a touche aucune ligne. C'est elle qui distingue les deux causes
    // possibles: statut different = un autre poste a double (CONFLICT), statut
    // inchange = la RLS a masque la ligne, donc un refus (UNAUTHORIZED). Par
    // defaut la relecture rend le meme statut.
    function makeSupabase(
      currentStatus: string | null,
      updateRows: unknown[] = [{ id: 'o1' }],
      statusApres?: string,
    ) {
      const premiereLecture = {
        data: currentStatus === null ? null : { status: currentStatus },
        error: null,
      };
      const maybeSingle = vi.fn().mockResolvedValue(premiereLecture);
      if (statusApres !== undefined) {
        maybeSingle
          .mockResolvedValueOnce(premiereLecture)
          .mockResolvedValue({ data: { status: statusApres }, error: null });
      }
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
      await expect(service.updateStatus('o1', 't1', 'ready')).resolves.toBe(true);
      expect(m.update).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('stamps served_at when reaching the terminal fulfillment state (delivered, C3)', async () => {
      const m = makeSupabase('ready', [{ id: 'o1' }]);
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'delivered')).resolves.toBe(true);
      expect(m.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'delivered', served_at: expect.any(String) }),
      );
    });

    it('is a no-op when the status is unchanged', async () => {
      const m = makeSupabase('ready');
      const service = createOrderService(m.client);
      // false = nothing changed: the caller must not re-send the ready push.
      await expect(service.updateStatus('o1', 't1', 'ready')).resolves.toBe(false);
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
      // La relecture montre un statut DIFFERENT: quelqu un a bien double.
      const m = makeSupabase('preparing', [], 'delivered');
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('throws UNAUTHORIZED when RLS masked the row (0 rows, statut inchange)', async () => {
      // Zero ligne touchee ET statut inchange a la relecture: personne n a
      // double, c est la RLS qui a refuse l ecriture. Annoncer "la commande a
      // deja ete mise a jour" serait faux - cas atteignable par un caissier ou
      // un chef, que la garde en base refuse sans delegation explicite.
      const m = makeSupabase('preparing', []);
      const service = createOrderService(m.client);
      await expect(service.updateStatus('o1', 't1', 'ready')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
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
    // In-memory order row that REALLY applies the filters the code sets
    // (eq / neq / or), like Postgres re-checks them on the locked row:
    // without that, a double cancellation could not be told from a single one.
    type Row = {
      id: string;
      status: string;
      payment_status: string | null;
      coupon_id: string | null;
    };
    function makeSupabase(opts: {
      order: Row | null;
      fetchError?: unknown;
      updateError?: unknown;
      /** A concurrent markPaid commits just before our UPDATE takes the row. */
      paidJustBeforeUpdate?: boolean;
    }) {
      const state = { row: opts.order ? { ...opts.order } : null };
      // Postgres semantics: a comparison with NULL is never true.
      const neq = (a: unknown, b: unknown) => a !== null && a !== undefined && a !== b;
      function chain(payload: Record<string, unknown> | null) {
        const tests: Array<(r: Record<string, unknown>) => boolean> = [];
        const api = {
          eq(k: string, v: unknown) {
            if (k !== 'tenant_id') tests.push((r) => r[k] === v);
            return api;
          },
          neq(k: string, v: unknown) {
            tests.push((r) => neq(r[k], v));
            return api;
          },
          or(expr: string) {
            // Only the form the code uses: "<col>.is.null,<col>.neq.<value>".
            const [isNull, notEq] = expr.split(',');
            const col = isNull.split('.')[0];
            const value = notEq.split('.').slice(2).join('.');
            tests.push((r) => r[col] === null || neq(r[col], value));
            return api;
          },
          async select() {
            if (opts.updateError) return { data: null, error: opts.updateError };
            if (payload && opts.paidJustBeforeUpdate && state.row) {
              state.row.payment_status = 'paid';
            }
            const row = state.row as Record<string, unknown> | null;
            const ok = !!row && tests.every((t) => t(row));
            if (!payload || !ok) return { data: [], error: null };
            Object.assign(row as Record<string, unknown>, payload);
            return { data: [{ id: row!.id }], error: null };
          },
          async maybeSingle() {
            return { data: state.row ? { ...state.row } : null, error: opts.fetchError ?? null };
          },
        };
        return api;
      }
      const update = vi.fn((payload: Record<string, unknown>) => chain(payload));
      const select = vi.fn(() => chain(null));
      const rpc = vi.fn().mockResolvedValue({ error: null });
      const from = vi.fn().mockReturnValue({ select, update });
      return { client: { from, rpc } as unknown as SupabaseClient, rpc, update, state };
    }

    it('marks cancelled, with no RPC from the staff session (coupon and stock by the caller)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'pending', coupon_id: 'c1' },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).resolves.toBe(true);

      // Neither restock nor coupon release from the staff session: both are
      // service-role only and done by the caller.
      expect(m.rpc).not.toHaveBeenCalled();
      expect(m.update).toHaveBeenCalledWith({ status: 'cancelled' });
      expect(m.state.row?.status).toBe('cancelled');
    });

    it('B67: of two concurrent cancellations, only one cancels', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'pending', coupon_id: 'c1' },
      });
      const service = createOrderService(m.client);

      const results = await Promise.all([
        service.cancelOrder('o1', 'tenant-123'),
        service.cancelOrder('o1', 'tenant-123'),
      ]);

      expect([...results].sort()).toEqual([false, true]);
    });

    it('B68: an order paid in the meantime is NOT cancelled (CONFLICT)', async () => {
      // Read as pending, then a concurrent encashment lands before the write:
      // the old unguarded UPDATE produced an order paid AND cancelled.
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'pending', coupon_id: 'c1' },
        paidJustBeforeUpdate: true,
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(m.state.row?.status).toBe('preparing');
    });

    it('cancels an order whose payment status is NULL (treated as pending)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'pending', payment_status: null, coupon_id: null },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).resolves.toBe(true);
      expect(m.state.row?.status).toBe('cancelled');
    });

    it('is a no-op when the order is already cancelled (returns false)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'cancelled', payment_status: 'pending', coupon_id: 'c1' },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).resolves.toBe(false);
    });

    it('refuses to cancel a paid order (CONFLICT)', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'delivered', payment_status: 'paid', coupon_id: null },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('throws NOT_FOUND when the order does not exist', async () => {
      const m = makeSupabase({ order: null });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('maps a guard refusal (42501) to UNAUTHORIZED', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'pending', coupon_id: 'c1' },
        updateError: { code: '42501', message: 'exige le droit d encaisser' },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    // Money still in the ledger: the database guard (migration 20261124210000)
    // refuses with a HINT; the service turns it into a clear refusal instead
    // of the generic permission message, without reading the ledger itself.
    it('maps the deposit refusal (money authority needed) to the translatable reason', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'partial', coupon_id: null },
        updateError: {
          code: '42501',
          message: 'exige l autorite sur l argent',
          hint: 'orders_annulation_exige_autorite_argent',
        },
      });
      const service = createOrderService(m.client);

      await expect(service.cancelOrder('o1', 'tenant-123')).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { reason: 'cancel_needs_money_authority' },
      });
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('maps the refund-first refusal (ledger covers the due) to CONFLICT', async () => {
      const m = makeSupabase({
        order: { id: 'o1', status: 'preparing', payment_status: 'partial', coupon_id: null },
        updateError: {
          code: '42501',
          message: 'il faut d abord la rembourser',
          hint: 'orders_annulation_exige_remboursement',
        },
      });
      const service = createOrderService(m.client);

      const err = await service.cancelOrder('o1', 'tenant-123').catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'CONFLICT' });
      expect((err as { details?: { reason?: string } }).details?.reason).toBeUndefined();
    });
  });
});
