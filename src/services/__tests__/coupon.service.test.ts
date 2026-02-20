import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCouponService } from '../coupon.service';
import { ServiceError } from '../errors';

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
 *
 * The coupon service uses these Supabase chains:
 *  - validateCoupon:  .from('coupons').select('*').eq().eq().eq().single()
 *  - createCoupon:    .from('coupons').insert({}).select('*').single()
 *  - deleteCoupon:    .from('coupons').delete().eq().eq()
 *  - incrementUsage:  .rpc('increment_coupon_usage', {...})
 */
function createMockSupabase() {
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  function getChain(table: string) {
    if (!chains[table]) {
      chains[table] = {
        select: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(),
      };
    }
    return chains[table];
  }

  const mockRpc = vi.fn();

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    // validateCoupon: .select('*').eq().eq().eq().single()
    // Each .eq() returns an object with .eq() and .single()
    const eqTerminal = {
      eq: vi.fn().mockReturnValue({
        single: chain.single,
      }),
      single: chain.single,
    };

    const eqMiddle = {
      eq: vi.fn().mockReturnValue(eqTerminal),
      single: chain.single,
    };

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(eqMiddle),
        single: chain.single,
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: chain.single,
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
  });

  return {
    from: mockFrom,
    rpc: mockRpc,
    _chains: chains,
    _getChain: getChain,
  };
}

/** Cast mock to SupabaseClient for the service factory */
function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

/** Build a valid coupon object for test overrides */
function makeCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    tenant_id: 'tenant-123',
    code: 'SUMMER10',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 0,
    max_discount_amount: null,
    valid_from: '2025-01-01T00:00:00Z',
    valid_until: '2027-12-31T23:59:59Z',
    max_uses: null,
    current_uses: 0,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CouponService', () => {
  describe('validateCoupon', () => {
    it('should return valid result for a valid percentage coupon', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ discount_type: 'percentage', discount_value: 10 }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('SUMMER10', 'tenant-123', 1000);

      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(100); // 10% of 1000
      expect(result.coupon).toBeDefined();
    });

    it('should return invalid when coupon not found', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('INVALID', 'tenant-123', 1000);

      expect(result.valid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.error).toBe('Code promo invalide');
    });

    it('should return invalid when coupon expired', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ valid_until: '2020-01-01T00:00:00Z' }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('SUMMER10', 'tenant-123', 1000);

      expect(result.valid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.error).toContain('expiré');
    });

    it('should return invalid when max_uses reached', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ max_uses: 5, current_uses: 5 }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('SUMMER10', 'tenant-123', 1000);

      expect(result.valid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.error).toContain("limite d'utilisation");
    });

    it('should return invalid when order below min_order_amount', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ min_order_amount: 500 }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('SUMMER10', 'tenant-123', 200);

      expect(result.valid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.error).toContain('500');
    });

    it('should cap percentage discount at max_discount_amount', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({
          discount_type: 'percentage',
          discount_value: 20,
          max_discount_amount: 50,
        }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      // 20% of 1000 = 200, but capped at 50
      const result = await service.validateCoupon('SUMMER10', 'tenant-123', 1000);

      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(50);
    });

    it('should calculate fixed discount correctly', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ discount_type: 'fixed', discount_value: 25 }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.validateCoupon('FIXED25', 'tenant-123', 100);

      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(25);
    });

    it('should cap fixed discount at subtotal', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon({ discount_type: 'fixed', discount_value: 50 }),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      // Fixed discount of 50 but subtotal is only 30
      const result = await service.validateCoupon('FIXED50', 'tenant-123', 30);

      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(30); // Capped at subtotal
    });

    it('should normalize coupon code to uppercase and trim', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: makeCoupon(),
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      await service.validateCoupon('  summer10  ', 'tenant-123', 1000);

      // Verify the from().select().eq().eq() chain was called with uppercase trimmed code
      const fromCall = supabase.from.mock.results[0].value;
      const selectCall = fromCall.select.mock.results[0].value;
      const firstEqCall = selectCall.eq.mock.results[0].value;
      // The second .eq() should be called with 'code' and the normalized value
      expect(firstEqCall.eq).toHaveBeenCalledWith('code', 'SUMMER10');
    });
  });

  describe('createCoupon', () => {
    it('should create a coupon successfully', async () => {
      const supabase = createMockSupabase();
      const createdCoupon = makeCoupon({ code: 'NEWCODE' });
      supabase._getChain('coupons').single.mockResolvedValue({
        data: createdCoupon,
        error: null,
      });

      const service = createCouponService(asSupabase(supabase));
      const result = await service.createCoupon('tenant-123', {
        code: 'newcode',
        discount_type: 'percentage',
        discount_value: 15,
      });

      expect(result).toEqual(createdCoupon);
      expect(supabase.from).toHaveBeenCalledWith('coupons');
    });

    it('should throw CONFLICT on duplicate code (Postgres error 23505)', async () => {
      const supabase = createMockSupabase();
      supabase._getChain('coupons').single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      const service = createCouponService(asSupabase(supabase));

      await expect(
        service.createCoupon('tenant-123', {
          code: 'DUPLICATE',
          discount_type: 'fixed',
          discount_value: 10,
        }),
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createCoupon('tenant-123', {
          code: 'DUPLICATE',
          discount_type: 'fixed',
          discount_value: 10,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('incrementUsage', () => {
    it('should call RPC increment_coupon_usage', async () => {
      const supabase = createMockSupabase();
      supabase.rpc.mockResolvedValue({ data: null, error: null });

      const service = createCouponService(asSupabase(supabase));
      await service.incrementUsage('coupon-1');

      expect(supabase.rpc).toHaveBeenCalledWith('increment_coupon_usage', {
        p_coupon_id: 'coupon-1',
      });
    });
  });
});
