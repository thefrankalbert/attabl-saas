import { z } from 'zod';

/**
 * Zod schemas for contact form validation.
 * Used in contact server action.
 *
 * `.trim()` passe AVANT `.min()`: un nom ou un message fait seulement
 * d'espaces compte pour vide et est refuse.
 */

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().trim().email('Email invalide'),
  company: z.string().optional(),
  date: z.string().optional(),
  message: z.string().trim().min(10, 'Le message doit contenir au moins 10 caractères'),
});
