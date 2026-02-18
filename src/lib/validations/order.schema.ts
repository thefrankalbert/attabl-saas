import { z } from 'zod';

/**
 * Zod schemas for order validation.
 * Used in /api/orders POST route.
 */

const orderItemOptionSchema = z.object({
  name_fr: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
});

const orderItemVariantSchema = z.object({
  name_fr: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  price: z.number().min(0),
});

const orderItemModifierSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().min(0),
});

export const orderItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Le nom est requis').max(200),
  name_en: z.string().max(200).optional(),
  price: z.number().min(0, 'Le prix doit être positif'),
  quantity: z
    .number()
    .int('La quantité doit être un entier')
    .min(1, 'La quantité minimum est 1')
    .max(100, 'La quantité maximum est 100'),
  category_name: z.string().max(200).optional(),
  selectedOption: orderItemOptionSchema.optional(),
  selectedVariant: orderItemVariantSchema.optional(),
  // ─── Production upgrade ──────────────────────────────
  modifiers: z.array(orderItemModifierSchema).max(20).optional(),
  customerNotes: z.string().max(500).optional(),
  course: z.enum(['appetizer', 'main', 'dessert', 'drink']).optional(),
});

export const createOrderSchema = z.object({
  items: z
    .array(orderItemSchema)
    .min(1, 'Le panier ne peut pas être vide')
    .max(50, 'Maximum 50 articles par commande'),
  notes: z.string().max(500, 'Les notes ne doivent pas dépasser 500 caractères').optional(),
  tableNumber: z.string().max(10).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  // ─── Production upgrade ──────────────────────────────
  service_type: z.enum(['dine_in', 'takeaway', 'delivery', 'room_service']).default('dine_in'),
  room_number: z.string().max(20).optional(),
  delivery_address: z.string().max(500).optional(),
  coupon_code: z.string().max(50).optional(),
  server_id: z.string().uuid().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
