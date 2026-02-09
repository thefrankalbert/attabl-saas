import { z } from 'zod';

/**
 * Zod schemas for onboarding validation.
 * Used in /api/onboarding/save and /api/onboarding/complete routes.
 */

export const onboardingSaveSchema = z.object({
  step: z
    .number()
    .int('Le step doit être un entier')
    .min(1, 'Step minimum: 1')
    .max(4, 'Step maximum: 4'),
  data: z.record(z.string(), z.unknown()),
});

export type OnboardingSaveInput = z.infer<typeof onboardingSaveSchema>;

/**
 * Schema for onboarding completion (/api/onboarding/complete).
 * Validates all fields that get written to the tenants table.
 */
const menuItemSchema = z.object({
  name: z.string().max(200),
  price: z.number().min(0).optional().default(0),
  category: z.string().max(100).optional(),
});

export const onboardingCompleteSchema = z.object({
  data: z.object({
    establishmentType: z.string().max(50).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    tableCount: z.number().int().min(0).max(500).optional(),
    logoUrl: z.union([z.string().url(), z.literal('')]).optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .optional(),
    description: z.string().max(500).optional(),
    tenantSlug: z.string().max(100).optional(),
    menuItems: z.array(menuItemSchema).max(50).optional(),
  }),
});

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
