'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions<T extends Record<string, unknown>> {
  /** Unique channel name */
  channelName: string;
  /** Supabase table to subscribe to */
  table: string;
  /** Postgres filter string, e.g. `tenant_id=eq.abc123` */
  filter?: string;
  /** Events to listen for. Defaults to all (*) */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  /** Callback for INSERT events */
  onInsert?: (record: T) => void;
  /** Callback for UPDATE events */
  onUpdate?: (record: T, oldRecord: Partial<T>) => void;
  /** Callback for DELETE events */
  onDelete?: (oldRecord: Partial<T>) => void;
  /** Callback for any change (runs in addition to specific callbacks) */
  onChange?: () => void;
  /** Whether subscription is active. Defaults to true */
  enabled?: boolean;
}

/**
 * Reusable Supabase Realtime subscription hook.
 * Handles subscribe/unsubscribe lifecycle and connection errors with retry.
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>({
  channelName,
  table,
  filter,
  event = '*',
  onInsert,
  onUpdate,
  onDelete,
  onChange,
  enabled = true,
}: UseRealtimeSubscriptionOptions<T>) {
  // Use refs for callbacks to avoid re-subscribing on every render
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete, onChange });
  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete, onChange };
  });

  // Bumping this forces the effect to tear down and rebuild the channel. Used to
  // recover from CHANNEL_ERROR/TIMED_OUT (e.g. auth token rotated mid-session):
  // a fresh channel re-subscribes with the current token instead of staying dead.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const supabase = createClient();

    const channelConfig: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema: 'public',
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, (payload: RealtimePostgresChangesPayload<T>) => {
        const { onInsert: ins, onUpdate: upd, onDelete: del, onChange: chg } = callbacksRef.current;

        switch (payload.eventType) {
          case 'INSERT':
            ins?.(payload.new as T);
            break;
          case 'UPDATE':
            upd?.(payload.new as T, payload.old as Partial<T>);
            break;
          case 'DELETE':
            del?.(payload.old as Partial<T>);
            break;
        }

        chg?.();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn(`Realtime channel ${channelName} down (${status}) - scheduling reconnect`);
          // Rebuild the channel after a short backoff. Guard against stacking timers.
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => setRetryTick((t) => t + 1), 2000);
          }
        }
      });

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [channelName, table, filter, event, enabled, retryTick]);
}
