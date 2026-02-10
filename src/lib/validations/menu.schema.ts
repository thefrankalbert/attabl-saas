import { z } from 'zod';

// ─── Create Menu Schema ──────────────────────────────────

export const createMenuSchema = z.object({
  name: z.string().min(2, { message: 'Le nom doit contenir au moins 2 caractères' }).max(100),
  name_en: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  description_en: z.string().max(500).optional(),
  venue_id: z.string().uuid().nullable().optional(),
  parent_menu_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(0).default(0),
});

// ─── Update Menu Schema ──────────────────────────────────

export const updateMenuSchema = createMenuSchema.partial().extend({
  id: z.string().uuid(),
});

// ─── Inferred Types ──────────────────────────────────────

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
