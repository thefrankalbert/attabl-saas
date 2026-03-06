import { z } from 'zod';

/**
 * Zod schemas for domain verification validation.
 * Used in /api/domain-verify route.
 */

export const domainVerifySchema = z.object({
  domain: z
    .string()
    .min(1, 'Domain required')
    .max(253, 'Domain too long')
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Invalid domain format',
    ),
});

export type DomainVerifyInput = z.infer<typeof domainVerifySchema>;
