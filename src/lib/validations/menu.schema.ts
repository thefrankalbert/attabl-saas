import { z } from 'zod';
import { renderableImageUrlSchema } from './image-url.schema';

// --- Base Menu Schema (sans valeurs par defaut) -----------

// Audit B25: avec Zod 4, `.partial()` CONSERVE les `.default()`. Deriver la
// mise a jour du schema de creation remettait `display_order = 0` et
// `is_transversal_menu = false` a chaque activation/desactivation d'une carte.
// Les defauts ne vivent donc que dans le schema de creation.
const menuBaseSchema = z.object({
  name: z.string().min(2, { message: 'Le nom doit contenir au moins 2 caractères' }).max(100),
  name_en: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  description_en: z.string().max(500).optional(),
  venue_id: z.string().uuid().nullable().optional(),
  parent_menu_id: z.string().uuid().nullable().optional(),
  image_url: renderableImageUrlSchema.optional().or(z.literal('')),
  is_active: z.boolean(),
  is_transversal_menu: z.boolean(),
  display_order: z.number().int().min(0),
});

// --- Create Menu Schema ----------------------------------

export const createMenuSchema = menuBaseSchema.extend({
  is_active: z.boolean().default(true),
  is_transversal_menu: z.boolean().optional().default(false),
  display_order: z.number().int().min(0).default(0),
});

// --- Update Menu Schema ----------------------------------

export const updateMenuSchema = menuBaseSchema.partial().extend({
  id: z.string().uuid(),
});

// --- Reorder Menus Schema --------------------------------

// Audit B56: `orderedIds` arrivait sans validation (5000 entrees, doublons).
export const reorderMenusSchema = z
  .array(z.string().uuid())
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Identifiant en double' });

// --- Inferred Types --------------------------------------

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
