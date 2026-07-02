'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createCouponService } from '@/services/coupon.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const couponIdSchema = z.string().uuid();

const couponPayloadSchema = z.object({
  code: z.string().min(1).max(50),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  min_order_amount: z.number().min(0).nullable().optional(),
  max_discount_amount: z.number().min(0).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
});

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    return { error: 'Permissions insuffisantes' };
  }
}

/**
 * SECURITY: Session membership verified before creating coupon.
 * tenantId is cross-checked against admin_users (IDOR prevention).
 */
export async function actionCreateCoupon(
  tenantId: string,
  payload: z.infer<typeof couponPayloadSchema>,
): Promise<ActionResponse<unknown>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedPayload = couponPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    const data = await couponService.createCoupon(tenantId, parsedPayload.data);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before updating coupon.
 * updateCoupon also filters by tenant_id (belt-and-suspenders).
 */
export async function actionUpdateCoupon(
  tenantId: string,
  couponId: string,
  payload: z.infer<typeof couponPayloadSchema>,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCouponId = couponIdSchema.safeParse(couponId);
  if (!parsedTenant.success || !parsedCouponId.success) return { error: 'Invalid input' };

  const parsedPayload = couponPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    await couponService.updateCoupon(couponId, tenantId, parsedPayload.data);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deleting coupon.
 * Service deleteCoupon also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeleteCoupon(
  tenantId: string,
  couponId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCouponId = couponIdSchema.safeParse(couponId);
  if (!parsedTenant.success || !parsedCouponId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    await couponService.deleteCoupon(couponId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before toggling coupon active state.
 * Service toggleActive also filters by tenant_id (belt-and-suspenders).
 */
export async function actionToggleCouponActive(
  tenantId: string,
  couponId: string,
  newValue: boolean,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedCouponId = couponIdSchema.safeParse(couponId);
  if (!parsedTenant.success || !parsedCouponId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    await couponService.toggleActive(couponId, tenantId, newValue);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
