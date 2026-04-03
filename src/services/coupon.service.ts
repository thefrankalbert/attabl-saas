import type { SupabaseClient } from '@supabase/supabase-js';
import type { Coupon } from '@/types/admin.types';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';

export interface CouponValidationResult {
  valid: boolean;
  coupon?: Coupon;
  discountAmount: number;
  error?: string;
}

/**
 * Coupon service - validates coupons and calculates discounts.
 *
 * Security: All validation is server-side. Client sends coupon code,
 * server verifies validity, calculates discount, and applies atomically.
 */
export function createCouponService(supabase: SupabaseClient) {
  return {
    /**
     * Validate a coupon code and calculate the discount amount.
     */
    async validateCoupon(
      code: string,
      tenantId: string,
      orderSubtotal: number,
    ): Promise<CouponValidationResult> {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select(
          'id, tenant_id, code, discount_type, discount_value, min_order_amount, max_discount_amount, valid_from, valid_until, max_uses, current_uses, is_active, created_at, updated_at',
        )
        .eq('tenant_id', tenantId)
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !coupon) {
        return { valid: false, discountAmount: 0, error: 'Code promo invalide' };
      }

      // Check validity period
      const now = new Date();
      if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        return { valid: false, discountAmount: 0, error: "Ce code n'est pas encore valide" };
      }
      if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        return { valid: false, discountAmount: 0, error: 'Ce code a expiré' };
      }

      // Check usage limit
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        return {
          valid: false,
          discountAmount: 0,
          error: "Ce code a atteint sa limite d'utilisation",
        };
      }

      // Check minimum order amount
      if (coupon.min_order_amount && orderSubtotal < coupon.min_order_amount) {
        return {
          valid: false,
          discountAmount: 0,
          error: `Commande minimum de ${coupon.min_order_amount.toLocaleString()} requise`,
        };
      }

      // Calculate discount
      let discountAmount = 0;
      if (coupon.discount_type === 'fixed') {
        discountAmount = coupon.discount_value;
      } else {
        // Percentage
        discountAmount = (orderSubtotal * coupon.discount_value) / 100;
        if (coupon.max_discount_amount) {
          discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
        }
      }

      // Never discount more than subtotal
      discountAmount = Math.min(discountAmount, orderSubtotal);
      // Round to 2 decimal places
      discountAmount = Math.round(discountAmount * 100) / 100;

      return { valid: true, coupon: coupon as Coupon, discountAmount };
    },

    /**
     * Atomically validate and increment coupon usage.
     * Returns true if the coupon was successfully claimed, false if limit reached.
     * This prevents race conditions where two concurrent orders both pass the check.
     */
    async claimUsage(couponId: string): Promise<boolean> {
      const { data, error } = await supabase.rpc('claim_coupon_usage', {
        p_coupon_id: couponId,
      });
      if (error) {
        logger.error('Failed to claim coupon usage', error);
        return false;
      }
      return data === true;
    },

    /**
     * Rollback a previously claimed coupon usage by decrementing current_uses.
     * Used when order creation fails after coupon was already claimed.
     */
    async unclaimUsage(couponId: string): Promise<void> {
      const { error } = await supabase.rpc('unclaim_coupon_usage', {
        p_coupon_id: couponId,
      });
      if (error) {
        logger.error('Failed to unclaim coupon usage', { couponId, error });
      }
    },

    /**
     * Create a new coupon for a tenant.
     */
    async createCoupon(
      tenantId: string,
      data: {
        code: string;
        discount_type: 'percentage' | 'fixed';
        discount_value: number;
        min_order_amount?: number | null;
        max_discount_amount?: number | null;
        valid_from?: string | null;
        valid_until?: string | null;
        max_uses?: number | null;
      },
    ): Promise<Coupon> {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .insert({
          tenant_id: tenantId,
          code: data.code.toUpperCase().trim(),
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          min_order_amount: data.min_order_amount || 0,
          max_discount_amount: data.max_discount_amount || null,
          valid_from: data.valid_from || new Date().toISOString(),
          valid_until: data.valid_until || null,
          max_uses: data.max_uses || null,
          is_active: true,
          current_uses: 0,
        })
        .select(
          'id, tenant_id, code, discount_type, discount_value, min_order_amount, max_discount_amount, valid_from, valid_until, max_uses, current_uses, is_active, created_at, updated_at',
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new ServiceError('Ce code promo existe déjà', 'CONFLICT');
        }
        throw new ServiceError('Erreur lors de la création du coupon', 'INTERNAL', error);
      }

      return coupon as Coupon;
    },

    /**
     * Update an existing coupon.
     */
    async updateCoupon(
      couponId: string,
      data: {
        code: string;
        discount_type: 'percentage' | 'fixed';
        discount_value: number;
        min_order_amount?: number | null;
        max_discount_amount?: number | null;
        valid_from?: string | null;
        valid_until?: string | null;
        max_uses?: number | null;
      },
    ): Promise<void> {
      const { error } = await supabase
        .from('coupons')
        .update({
          code: data.code.toUpperCase().trim(),
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          min_order_amount: data.min_order_amount ?? null,
          max_discount_amount: data.max_discount_amount ?? null,
          valid_from: data.valid_from ?? null,
          valid_until: data.valid_until ?? null,
          max_uses: data.max_uses ?? null,
        })
        .eq('id', couponId);

      if (error) {
        if (error.code === '23505') {
          throw new ServiceError('Ce code promo existe deja', 'CONFLICT');
        }
        throw new ServiceError('Erreur lors de la mise a jour du coupon', 'INTERNAL', error);
      }
    },

    /**
     * Delete a coupon.
     */
    async deleteCoupon(couponId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', couponId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression', 'INTERNAL', error);
      }
    },
  };
}
