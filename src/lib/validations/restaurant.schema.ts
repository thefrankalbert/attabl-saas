import { z } from 'zod';

export const ESTABLISHMENT_TYPES = [
  'restaurant',
  'hotel',
  'bar-cafe',
  'boulangerie',
  'dark-kitchen',
  'food-truck',
  'quick-service',
] as const;

export const PLAN_OPTIONS = ['trial', 'essentiel', 'premium'] as const;

export const createRestaurantStep1Schema = z.object({
  name: z.string().min(2, 'Minimum 2 caractères').max(100, 'Maximum 100 caractères'),
  type: z.enum(ESTABLISHMENT_TYPES, {
    error: "Type d'établissement invalide",
  }),
  slug: z
    .string()
    .min(2, 'Minimum 2 caractères')
    .max(50, 'Maximum 50 caractères')
    .regex(/^[a-z0-9-]+$/, 'Slug invalide : lettres minuscules, chiffres et tirets uniquement'),
});

export const createRestaurantStep2Schema = z.object({
  plan: z.enum(PLAN_OPTIONS, {
    error: 'Plan invalide',
  }),
});

export const createRestaurantSchema = createRestaurantStep1Schema.merge(
  createRestaurantStep2Schema,
);

export type CreateRestaurantStep1Input = z.infer<typeof createRestaurantStep1Schema>;
export type CreateRestaurantStep2Input = z.infer<typeof createRestaurantStep2Schema>;
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
