'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrderOutbox } from '@/lib/offline/outbox-idb';
import { replayOrderEntry, OUTBOX_CHANGED_EVENT } from '@/lib/offline/submit-order';
import type { OutboxEntry } from '@/lib/offline/outbox';
import { logger } from '@/lib/logger';

/** While entries are pending, retry roughly this often (covers 5xx-while-online). */
const PENDING_DRAIN_INTERVAL_MS = 15000;

export interface UseOrderOutbox {
  /** Number of orders waiting to sync. */
  pending: number;
  /** Orders the server permanently refused on replay (need operator attention). */
  rejected: OutboxEntry[];
  /** Force a drain now (e.g. right after queueing). */
  flush: () => Promise<void>;
  /** Clear the rejected list once the operator has acknowledged it. */
  dismissRejected: () => void;
}

/**
 * Drains the durable order outbox: on mount, on reconnect, on tab refocus, and
 * on a light interval while anything is still pending. Replays are idempotent
 * (client_request_id), so re-draining is safe. Not a data-fetching hook - it
 * replays queued writes, hence the direct fetch via replayOrderEntry.
 */
export function useOrderOutbox(): UseOrderOutbox {
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<OutboxEntry[]>([]);
  const draining = useRef(false);
  const pendingRef = useRef(0);

  const setPendingBoth = useCallback((n: number) => {
    pendingRef.current = n;
    setPending(n);
  }, []);

  const flush = useCallback(async () => {
    const outbox = getOrderOutbox();
    if (!outbox) return;
    // Don't replay while offline: it can't succeed and would burn the per-entry
    // attempt budget, wrongly dropping orders as "failed" during a long outage.
    // Still refresh the count so a freshly-queued order shows in the banner. The
    // 'online' event re-triggers a real drain the moment the network is back.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPendingBoth(await outbox.count());
      return;
    }
    if (draining.current) return; // avoid overlapping drains (interval + event)
    draining.current = true;
    try {
      const result = await outbox.drain(replayOrderEntry);
      setPendingBoth(result.stillQueued);
      if (result.permanentlyFailed.length > 0) {
        setRejected((prev) => [...prev, ...result.permanentlyFailed]);
      }
    } catch (err) {
      logger.error('Order outbox drain failed', { err });
    } finally {
      draining.current = false;
    }
  }, [setPendingBoth]);

  const dismissRejected = useCallback(() => setRejected([]), []);

  useEffect(() => {
    const outbox = getOrderOutbox();
    if (!outbox) return;

    let cancelled = false;
    void outbox.count().then((n) => {
      if (!cancelled) setPendingBoth(n);
    });
    void flush();

    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush();
    };
    const onChanged = () => void flush();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onChanged);
    // Read pending via a ref so this effect runs once (stable listeners) yet the
    // interval still sees the latest count.
    const interval = window.setInterval(() => {
      if (pendingRef.current > 0) void flush();
    }, PENDING_DRAIN_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onChanged);
      window.clearInterval(interval);
    };
  }, [flush, setPendingBoth]);

  return { pending, rejected, flush, dismissRejected };
}
