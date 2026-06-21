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
  code: z.string().min(1, 'Code requis'),
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
