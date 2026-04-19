import { z } from 'zod';

export const preparationZoneSchema = z.enum(['kitchen', 'bar', 'both']);

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Le nom est requis' })
    .max(100, { message: 'Le nom est trop long' }),
  name_en: z.string().max(100).nullable().optional(),
  display_order: z.number().int().min(0).default(0),
  preparation_zone: preparationZoneSchema.optional().default('kitchen'),
  is_featured_on_home: z.boolean().optional().default(false),
  tenant_id: z.string().uuid(),
  menu_id: z.string().uuid().nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  id: z.string().uuid().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
