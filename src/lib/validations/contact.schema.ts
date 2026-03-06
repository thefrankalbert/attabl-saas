import { z } from 'zod';

/**
 * Zod schemas for contact form validation.
 * Used in contact server action.
 */

export const contactSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  company: z.string().optional(),
  date: z.string().optional(),
  message: z.string().min(10, 'Le message doit contenir au moins 10 caractères'),
});

export type ContactInput = z.infer<typeof contactSchema>;
