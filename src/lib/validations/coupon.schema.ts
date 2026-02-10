import { z } from 'zod';

/**
 * Zod schemas for coupon validation.
 * Used in admin coupon CRUD and API routes.
 */

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(2, 'Le code doit contenir au moins 2 caractères')
    .max(50, 'Le code ne doit pas dépasser 50 caractères')
    .transform((val) => val.toUpperCase().trim()),
  discount_type: z.enum(['percentage', 'fixed'], {
    message: 'Le type de réduction est requis',
  }),
  discount_value: z
    .number()
    .positive('La valeur doit être positive')
    .max(999999, 'Valeur trop élevée'),
  min_order_amount: z.number().min(0).optional(),
  max_discount_amount: z.number().min(0).optional(),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
  max_uses: z.number().int().positive().optional(),
  is_active: z.boolean().default(true),
});

export const updateCouponSchema = createCouponSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
