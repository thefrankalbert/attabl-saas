/**
 * Zod schemas for physical stock count operations.
 */

import { z } from 'zod';

export const openStockCountSchema = z.object({
  tenantId: z.string().uuid('ID tenant invalide'),
  reference: z.string().max(120, 'Reference trop longue (max 120 caracteres)').optional(),
  ingredientIds: z
    .array(z.string().uuid('ID ingredient invalide'))
    .max(5000, 'Trop d ingredients')
    .optional(),
});

export const saveStockCountLinesSchema = z.object({
  tenantId: z.string().uuid('ID tenant invalide'),
  countId: z.string().uuid('ID inventaire invalide'),
  lines: z
    .array(
      z.object({
        ingredient_id: z.string().uuid('ID ingredient invalide'),
        counted_qty: z
          .number()
          .finite('Quantite invalide')
          .nonnegative('La quantite ne peut pas etre negative')
          .nullable(),
      }),
    )
    .max(5000, 'Trop de lignes'),
});

export const commitStockCountSchema = z.object({
  tenantId: z.string().uuid('ID tenant invalide'),
  countId: z.string().uuid('ID inventaire invalide'),
});

export const cancelStockCountSchema = z.object({
  tenantId: z.string().uuid('ID tenant invalide'),
  countId: z.string().uuid('ID inventaire invalide'),
});
