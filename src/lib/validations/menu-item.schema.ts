import { z } from 'zod';

/**
 * Validation schema for menu item write payloads (create + update).
 *
 * The keys mirror ALLOWED_MENU_ITEM_COLUMNS in
 * src/services/menu-item.service.ts (the server-side write contract).
 * z.object strips unknown keys by default - same effect as the service
 * allowlist - so extra fields sent by a client are dropped, never rejected
 * and never reach the DB.
 *
 * Free-text bounds are deliberately generous so editing pre-existing rows
 * never fails validation. The high-value checks are the types, the non-empty
 * name, the non-negative price and the uuid category_id.
 */
export const menuItemWriteSchema = z.object({
  name: z.string().trim().min(1).max(255),
  name_en: z.string().max(255).nullish(),
  description: z.string().max(5000).nullish(),
  description_en: z.string().max(5000).nullish(),
  price: z.number().min(0),
  // JSONB map of currency code -> price, only sent for multi-currency tenants.
  prices: z.record(z.string(), z.number()).nullish(),
  image_url: z.string().max(2048).nullish(),
  image_back_url: z.string().max(2048).nullish(),
  images: z.array(z.string().url().max(2048)).max(8).nullish(),
  is_available: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  is_vegetarian: z.boolean().optional(),
  is_spicy: z.boolean().optional(),
  is_drink: z.boolean().optional(),
  allergens: z.array(z.string()).nullish(),
  calories: z.number().nullish(),
  category_id: z.string().uuid(),
  display_order: z.number().int().nonnegative().optional(),
});

/** Create requires name, price and category_id (see menuItemWriteSchema). */
export const menuItemCreateSchema = menuItemWriteSchema;

/** Update is a partial write - callers may send only the fields they change. */
export const menuItemUpdateSchema = menuItemWriteSchema.partial();

export type MenuItemCreateInput = z.infer<typeof menuItemCreateSchema>;
export type MenuItemUpdateInput = z.infer<typeof menuItemUpdateSchema>;
