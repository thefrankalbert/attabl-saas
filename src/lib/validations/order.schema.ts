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
  name_en: z.string().max(200).nullish(),
  price: z.number().min(0, 'Le prix doit être positif'),
  quantity: z
    .number()
    .int('La quantité doit être un entier')
    .min(1, 'La quantité minimum est 1')
    .max(100, 'La quantité maximum est 100'),
  category_name: z.string().max(200).nullish(),
  selectedOption: orderItemOptionSchema.nullish(),
  selectedVariant: orderItemVariantSchema.nullish(),
  // ─── Production upgrade ──────────────────────────────
  modifiers: z.array(orderItemModifierSchema).max(20).nullish(),
  customerNotes: z.string().max(500).nullish(),
  course: z.enum(['appetizer', 'main', 'dessert', 'drink']).nullish(),
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
  display_currency: z.enum(['XAF', 'EUR', 'USD']).optional(),
  tip_amount: z.number().min(0).optional(),
});

// ─── POS-specific order schema ──────────────────────────
// POS orders include payment info and use menu_item_id instead of the full
// cart item shape used by QR orders. The server resolves names/prices from DB.

const posOrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(1, 'Minimum quantity is 1')
    .max(100, 'Maximum quantity is 100'),
  customer_notes: z.string().max(500).optional(),
  modifiers: z.array(orderItemModifierSchema).max(20).optional(),
  selected_variant: z.string().max(200).optional(),
});

export const createPOSOrderSchema = z.object({
  // tenant_id is derived from the authenticated user's session, NOT from client input (IDOR prevention)
  table_number: z.string().min(1).max(50),
  status: z.enum(['pending', 'delivered']),
  service_type: z.enum(['dine_in', 'takeaway', 'delivery', 'room_service']).default('dine_in'),
  room_number: z.string().max(20).optional(),
  delivery_address: z.string().max(500).optional(),
  payment_method: z.string().max(50).optional(),
  tip_amount: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
  coupon_code: z.string().max(50).optional(),
  items: z
    .array(posOrderItemSchema)
    .min(1, 'Cart cannot be empty')
    .max(50, 'Maximum 50 items per order'),
});

export type CreatePOSOrderInput = z.infer<typeof createPOSOrderSchema>;
export type POSOrderItemInput = z.infer<typeof posOrderItemSchema>;

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
