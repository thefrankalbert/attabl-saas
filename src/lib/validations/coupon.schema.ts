import { z } from 'zod';

/**
 * Zod schemas for coupon validation.
 * Used in admin coupon CRUD and API routes.
 */

/**
 * Schema for validating a coupon code (client-facing).
 * Used in /api/coupons/validate route.
 */
export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Code requis').max(50),
  subtotal: z.number().min(0, 'Le sous-total doit être positif').default(0),
  // Optional fallback when the middleware didn't inject x-tenant-slug
  // (e.g., localhost dev without subdomain routing). Header always wins when present.
  tenantSlug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/i)
    .optional(),
});

/**
 * Code d'un coupon cree par le restaurateur: lettres, chiffres et tirets, 3 a 20
 * caracteres, range en majuscules. Avant, "zz derniers!" etait accepte tel quel.
 */
const COUPON_CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(COUPON_CODE_PATTERN, 'Code invalide');

/** Corps d'un coupon pour la creation et la modification (Server Actions). */
export const couponPayloadSchema = z.object({
  code: couponCodeSchema,
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  min_order_amount: z.number().min(0).nullable().optional(),
  max_discount_amount: z.number().min(0).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
});
