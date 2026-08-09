'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrderOutbox } from '@/lib/offline/outbox-idb';
import { getOutboxIdentity } from '@/lib/offline/outbox-identity';
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
      setPendingBoth(await outbox.countDrainable(getOutboxIdentity() ?? undefined));
      return;
    }
    if (draining.current) return; // avoid overlapping drains (interval + event)
    draining.current = true;
    try {
      // currentUserId cloisonne le rejeu (OFF-07): les entrees mises en file par
      // une autre session restent en file au lieu de partir sous celle-ci.
      const identity = getOutboxIdentity();
      const result = await outbox.drain(replayOrderEntry, {
        currentUserId: identity?.userId,
        currentTenantId: identity?.tenantId,
      });
      // stillQueued compte TOUT, y compris les entrees d'une autre session que
      // cette session ne peut pas drainer (OFF-07). Les afficher donnerait un
      // compteur qui ne descend jamais quoi que fasse l'operateur - et un badge
      // rouge permanent est un badge qu'on cesse de regarder, donc le vrai signal
      // d'alerte se noie.
      setPendingBoth(Math.max(0, result.stillQueued - result.skippedForeign));
      // Relire le journal persistant plutot que d'empiler la valeur de retour:
      // il contient AUSSI ce que le service worker a perdu en Background Sync,
      // que cette page n'a jamais vu passer. La cle `id` dedoublonne pour nous.
      const journal = await outbox.listRejected();
      if (journal.length > 0 || result.permanentlyFailed.length > 0) {
        setRejected(journal);
      }
    } catch (err) {
      logger.error('Order outbox drain failed', { err });
    } finally {
      draining.current = false;
    }
  }, [setPendingBoth]);

  const dismissRejected = useCallback(() => {
    setRejected([]);
    // Vider aussi le journal persistant: sinon le bandeau reviendrait au
    // prochain drain, et un bandeau qu'on ne peut pas faire taire est un
    // bandeau que l'operateur apprend a ignorer.
    const outbox = getOrderOutbox();
    if (outbox) {
      void outbox.clearRejected().catch((err) => {
        logger.error('Order outbox clearRejected failed', { err });
      });
    }
  }, []);

  useEffect(() => {
    const outbox = getOrderOutbox();
    if (!outbox) return;

    let cancelled = false;
    void outbox.countDrainable(getOutboxIdentity() ?? undefined).then((n) => {
      if (!cancelled) setPendingBoth(n);
    });
    // Au montage, relire les pertes deja consignees AVANT tout drain: c'est le
    // cas "le caissier recharge la page apres une coupure" - sans cette lecture
    // il ne saurait jamais qu'il a perdu des tickets.
    void outbox.listRejected().then((entries) => {
      if (!cancelled && entries.length > 0) setRejected(entries);
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
