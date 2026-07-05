import { z } from 'zod';

// --- Row Validation Schema ------------------------------------

export const excelRowSchema = z.object({
  category: z
    .string({ error: 'Category is required' })
    .min(1, 'Category name cannot be empty')
    .max(100, 'Category name must be 100 characters or fewer'),
  categoryEn: z.string().max(100).nullable().optional(),
  name: z
    .string({ error: 'Dish name is required' })
    .min(1, 'Dish name cannot be empty')
    .max(200, 'Dish name must be 200 characters or fewer'),
  nameEn: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  descriptionEn: z.string().max(1000).nullable().optional(),
  price: z
    .number({ error: 'Price must be a valid number' })
    .positive('Price must be a positive number'),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});
