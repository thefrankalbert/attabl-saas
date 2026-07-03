import { z } from 'zod';

/**
 * Zod schemas for comp (offert), manager notes, and house accounts (ardoise).
 * Used by the order/house-account server actions. All string bounds match the
 * DB columns; tenant/order/account ids are validated as UUIDs.
 */

export const compOrderSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  reason: z.string().trim().min(1, 'Une raison est requise').max(500),
});

export const orderNoteSchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  note: z.string().trim().min(1, 'La note ne peut pas etre vide').max(1000),
});

export const houseAccountSchema = z.object({
  name: z.string().trim().min(1, 'Un nom est requis').max(120),
  description: z.string().trim().max(500).optional(),
});

export const attachHouseAccountSchema = z.object({
  orderId: z.string().uuid(),
  accountId: z.string().uuid(),
});

export const settleHouseAccountSchema = z.object({
  accountId: z.string().uuid(),
});

export type CompOrderInput = z.infer<typeof compOrderSchema>;
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;
export type HouseAccountInput = z.infer<typeof houseAccountSchema>;
