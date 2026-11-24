import { z } from 'zod';

/**
 * Quantite d'un ingredient dans une recette, dans l'unite de l'ingredient.
 * Bornes de la colonne `recipes.quantity_needed` (numeric(10,3), > 0): au plus
 * 3 decimales et moins de 10 000 000 (B82).
 */
export const recipeQuantitySchema = z
  .number()
  .positive('elle doit etre superieure a 0')
  .lt(10_000_000, 'elle doit rester sous 10 000 000')
  .refine((q) => Math.abs(Math.round(q * 1000) - q * 1000) < 1e-6, {
    message:
      "3 decimales au plus dans l'unite de l'ingredient. Saisissez une quantite plus grande ou dans l'unite de l'ingredient.",
  });
