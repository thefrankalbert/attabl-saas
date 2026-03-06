import { z } from 'zod';

/**
 * Zod schemas for newsletter subscription validation.
 * Used in newsletter server action.
 */

export const newsletterSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
