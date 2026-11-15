import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Join Realtime channels only AFTER the signed-in user's JWT is handed to
 * Realtime, and return the cleanup.
 *
 * Measured 2026-11-14 on the kitchen screen: channels joined with NO user token
 * (no access_token in phx_join), so Realtime evaluated RLS as `anon` and dropped
 * every `orders` event. Screens only caught up through their polling fallback
 * (12 to 15 s in the kitchen). `realtime.setAuth()` without argument resolves the
 * token from the current session (supabase-js `accessToken` callback).
 */
export function subscribeWithAuth(
  supabase: SupabaseClient,
  label: string,
  join: () => RealtimeChannel[],
): () => void {
  let cancelled = false;
  let channels: RealtimeChannel[] = [];

  void supabase.realtime
    .setAuth()
    .catch((err: unknown) => logger.warn(`Realtime auth failed for ${label}`, { err }))
    .then(() => {
      if (cancelled) return;
      try {
        channels = join();
      } catch (err: unknown) {
        // Inside a promise a throw would vanish as an unhandled rejection; log it
        // so a broken channel is visible (screens still have their polling).
        logger.warn(`Realtime join failed for ${label}`, { err });
      }
    });

  return () => {
    cancelled = true;
    for (const channel of channels) {
      channel.unsubscribe();
      void supabase.removeChannel(channel);
    }
  };
}
