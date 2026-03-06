import { z } from 'zod';

/**
 * Zod schemas for push notification subscription validation.
 * Used in /api/push-subscriptions route.
 */

export const subscribeSchema = z.object({
  tenantId: z.string().uuid(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
