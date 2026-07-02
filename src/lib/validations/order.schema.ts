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
  // Stable DB id of the variant. Server verifies the price by id when present
  // (collision/rename-proof), falling back to name for legacy carts (audit H4).
  id: z.string().uuid().optional(),
  name_fr: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  price: z.number().min(0),
});

const orderItemModifierSchema = z.object({
  // Stable DB id of the modifier. See orderItemVariantSchema (audit H4).
  id: z.string().uuid().optional(),
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

export const createOrderSchema = z
  .object({
    items: z
      .array(orderItemSchema)
      .min(1, 'Le panier ne peut pas être vide')
      .max(50, 'Maximum 50 articles par commande'),
    notes: z.string().max(500, 'Les notes ne doivent pas dépasser 500 caractères').optional(),
    tableNumber: z.string().max(50).optional(),
    customerName: z.string().max(100).optional(),
    customerPhone: z.string().max(20).optional(),
    // ─── Production upgrade ──────────────────────────────
    service_type: z.enum(['dine_in', 'takeaway', 'delivery', 'room_service']).default('dine_in'),
    room_number: z.string().max(20).optional(),
    delivery_address: z.string().max(500).optional(),
    coupon_code: z
      .string()
      .max(50)
      .regex(
        /^[A-Z0-9_-]+$/i,
        'Le code ne peut contenir que lettres, chiffres, tirets et underscores',
      )
      .optional(),
    // server_id is intentionally excluded from the client-accepted schema.
    // POS orders derive the server from the authenticated session, and QR orders
    // (this schema) are anonymous. Accepting server_id from the client would let
    // an attacker attribute orders to an arbitrary staff member.
    display_currency: z.enum(['XAF', 'XOF', 'EUR', 'USD']).optional(),
    tip_amount: z.number().min(0).optional(),
    // Idempotency key minted client-side when the order is composed. Lets an
    // offline-replayed order dedupe server-side instead of creating a duplicate.
    client_request_id: z.string().uuid().optional(),
  })
  .superRefine(requireDestinationForServiceType);

/**
 * A destination is mandatory per service type: a delivery needs an address, a
 * room service needs a room. Before this the fields were always optional, so an
 * order could be submitted with service_type='delivery' and no address at all
 * (audit H5).
 *
 * dine_in table requiredness is intentionally NOT enforced here yet: the
 * storefront does not send service_type (everything defaults to dine_in) and the
 * table comes from a localStorage QR scan that can legitimately be absent, so
 * enforcing it at the schema would block real web orders. Table capture + the
 * table_id model land in Phase 1, which is where dine_in table requiredness
 * belongs. Shared by the QR and POS schemas.
 */
function requireDestinationForServiceType(
  data: {
    service_type: 'dine_in' | 'takeaway' | 'delivery' | 'room_service';
    delivery_address?: string;
    room_number?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.service_type === 'delivery' && !data.delivery_address?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['delivery_address'],
      message: "L'adresse de livraison est requise pour une commande en livraison",
    });
  }
  if (data.service_type === 'room_service' && !data.room_number?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['room_number'],
      message: 'Le numero de chambre est requis pour un service en chambre',
    });
  }
}

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
  // Stable DB id of the selected variant; server prefers it over the name for
  // price verification (audit H4). Name kept for legacy/fallback resolution.
  selected_variant_id: z.string().uuid().optional(),
});

export const createPOSOrderSchema = z
  .object({
    // tenant_id is derived from the authenticated user's session, NOT from client input (IDOR prevention)
    // Optional: takeaway/delivery/room-service and counter sales have no table.
    // The whole chain accepts NULL (service tableNumber?, RPC p_table_number DEFAULT NULL,
    // nullable column); requiring it here forced the POS to invent "CMD-<n>" pseudo-tables.
    table_number: z.string().min(1).max(50).optional(),
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
    // Idempotency key minted client-side when the order is composed. Lets an
    // offline-replayed POS order dedupe server-side instead of creating a duplicate.
    client_request_id: z.string().uuid().optional(),
  })
  .superRefine(requireDestinationForServiceType);

/** Cart pre-validation before POST /api/orders (same item shape, no checkout fields). */
export const orderPreviewSchema = z.object({
  items: createOrderSchema.shape.items,
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;
