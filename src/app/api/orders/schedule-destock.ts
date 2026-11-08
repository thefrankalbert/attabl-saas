/**
 * Stock deduction scheduling, shared by BOTH order channels (convive
 * /api/orders and POS /api/orders/pos).
 *
 * Its own module rather than route.helpers so the POS route does not drag in
 * the email / push server-only chain, and so the fix lands in exactly one place
 * for both channels.
 */
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { createInventoryService } from '@/services/inventory.service';
import { ServiceError } from '@/services/errors';

// Non-blocking: an order is never refused because the stock engine stumbled.
// `createdBy` is the acting operator for the anti-theft trail - NULL on the anon
// storefront, the POS user otherwise.
export function scheduleDestock(
  adminSupabase: SupabaseClient,
  params: { orderId: string; tenantId: string; createdBy?: string; channel: 'convive' | 'pos' },
): void {
  const { orderId, tenantId, createdBy, channel } = params;
  after(async () => {
    // TWO separate try blocks on purpose. With the low-stock check inside the
    // same one, a Resend outage or a missing env var on a cold start made the
    // restaurant read "stock non deduit" while the ingredients HAD been
    // deducted - and the owner would then "correct" a correct figure by hand.
    // The alert must only ever fire for a failed deduction.
    try {
      const inventoryService = createInventoryService(adminSupabase);
      await inventoryService.destockOrder(orderId, tenantId, createdBy);
    } catch (err) {
      logger.error('Auto-destock failed (non-blocking)', err, { channel, orderId, tenantId });
      Sentry.captureException(err, {
        tags: { area: 'inventory-destock', channel },
        extra: { orderId, tenantId },
      });
      // The dish goes out either way - the restaurant has to be TOLD its stock
      // was not deducted, otherwise the gap is only ever found at the next
      // physical count, with no way to tell which order caused it.
      try {
        const { notifyDestockFailed } = await import('@/services/notification.service');
        await notifyDestockFailed({
          tenantId,
          orderId,
          // Read from the typed error, NOT from its message: destockOrder maps
          // the RPC's INSUFFICIENT_STOCK to a CONFLICT ServiceError whose
          // message is localized French, so matching on the text silently
          // never matched and the shortage wording was dead code.
          outOfStock: err instanceof ServiceError && err.code === 'CONFLICT',
        });
      } catch (notifyErr) {
        // Already the error path: never let it become an unhandled rejection.
        logger.error('Auto-destock: warning the restaurant failed', { orderId, notifyErr });
      }
      return;
    }

    try {
      const { checkAndNotifyLowStock } = await import('@/services/notification.service');
      await checkAndNotifyLowStock(tenantId);
    } catch (err) {
      // The deduction DID happen; only the alerting stumbled. Never tell the
      // restaurant its stock was not deducted here.
      logger.error('Low-stock check failed after destock (non-blocking)', err, {
        channel,
        orderId,
        tenantId,
      });
      Sentry.captureException(err, {
        tags: { area: 'inventory-low-stock-check', channel },
        extra: { orderId, tenantId },
      });
    }
  });
}
