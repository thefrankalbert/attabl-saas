import { z } from 'zod';

/**
 * Zod schemas for Excel menu import validation.
 * Used in /api/menu-import POST route.
 */

export const excelRowSchema = z.object({
  category: z.string().min(1).max(100),
  categoryEn: z.string().max(100).optional().default(''),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().default(''),
  description: z.string().max(500).optional().default(''),
  descriptionEn: z.string().max(500).optional().default(''),
  price: z.number().positive(),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export type ExcelRow = z.infer<typeof excelRowSchema>;
