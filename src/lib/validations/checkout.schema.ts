import { z } from 'zod';

/**
 * Zod schemas for checkout/billing validation.
 * Used in /api/create-checkout-session route.
 */

export const createCheckoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business'], {
    error: 'Plan invalide. Choisissez starter, pro ou business.',
  }),
  billingInterval: z.enum(['monthly', 'semiannual', 'yearly']).optional().default('monthly'),
  tenantId: z.string().uuid('Tenant ID invalide'),
  email: z.string().email('Email invalide'),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

/**
 * Simplified checkout body schema - tenantId and email are derived from session.
 * Used in /api/create-checkout-session route.
 */
export const checkoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'business'], {
    error: 'Plan invalide. Choisissez starter, pro ou business.',
  }),
  billingInterval: z.enum(['monthly', 'semiannual', 'yearly']).optional().default('monthly'),
});

export type CheckoutBodyInput = z.infer<typeof checkoutBodySchema>;

/**
 * Query params schema for verify-checkout.
 * Used in /api/verify-checkout route.
 */
export const verifyCheckoutQuerySchema = z.object({
  session_id: z.string().min(1, 'Session ID requis'),
});

export type VerifyCheckoutQueryInput = z.infer<typeof verifyCheckoutQuerySchema>;

/**
 * Schema for updating an existing subscription (plan change).
 * Used in /api/update-subscription route.
 */
export const updateSubscriptionSchema = z.object({
  priceId: z.string().min(1, 'Price ID requis').startsWith('price_', 'Price ID invalide'),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
