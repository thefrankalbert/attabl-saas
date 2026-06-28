/**
 * Durable write outbox - isomorphic core (no browser APIs here).
 *
 * Part of the offline-first write layer for salle/resto tablets. When an order
 * write fails because the device is offline (or the network blips), the request
 * is queued durably and replayed on reconnect. Each entry carries a stable
 * client_request_id so a replay is deduped server-side (see migration
 * 20260628010000) instead of creating a duplicate order.
 *
 * This file holds only the queue logic over an injected store, so it can be
 * unit-tested with an in-memory store. The IndexedDB binding lives in
 * outbox-idb.ts (browser-only).
 */

/** A queued write waiting to reach the server. */
export interface OutboxEntry {
  /** Stable idempotency key (UUID). Also sent in the body as client_request_id. */
  id: string;
  /** Same-origin API path to POST to, e.g. '/api/orders' or '/api/orders/pos'. */
  endpoint: string;
  /** JSON body; already includes client_request_id === id. */
  body: unknown;
  /** Epoch ms when first queued. */
  createdAt: number;
  /** Replay attempts so far. */
  attempts: number;
  /** Last error message (network or server), for diagnostics/UI. */
  lastError?: string;
}

/** Minimal persistence contract the outbox needs. Implemented by IndexedDB. */
export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  getAll(): Promise<OutboxEntry[]>;
  delete(id: string): Promise<void>;
}

/** Outcome of replaying one entry against the server. */
export type ReplayOutcome =
  | { kind: 'success' } // 2xx - server accepted (or deduped); drop the entry.
  | { kind: 'permanent'; reason: string } // 4xx business reject; drop + surface.
  // offline / 5xx / 429; keep for later. countsAsAttempt=false (default for a
  // pure network-unreachable failure) means "don't burn the attempt budget" -
  // only server-answered transients should count toward MAX_ATTEMPTS.
  | { kind: 'retry'; reason: string; countsAsAttempt?: boolean };

/** Replays one entry. Provided by the caller (browser fetch in production). */
export type ReplayFn = (entry: OutboxEntry) => Promise<ReplayOutcome>;

/** Stop retrying an entry after this many attempts (avoid infinite loops). */
export const MAX_ATTEMPTS = 12;

export interface DrainResult {
  succeeded: number;
  permanentlyFailed: OutboxEntry[];
  stillQueued: number;
}

export function createOutbox(store: OutboxStore) {
  return {
    /** Queue a write. Returns the stored entry. */
    async enqueue(input: {
      id: string;
      endpoint: string;
      body: unknown;
      now: number;
    }): Promise<OutboxEntry> {
      const entry: OutboxEntry = {
        id: input.id,
        endpoint: input.endpoint,
        body: input.body,
        createdAt: input.now,
        attempts: 0,
      };
      await store.put(entry);
      return entry;
    },

    /** All queued entries, oldest first. id breaks createdAt ties deterministically. */
    async list(): Promise<OutboxEntry[]> {
      const all = await store.getAll();
      return all.sort(
        (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    },

    async count(): Promise<number> {
      return (await store.getAll()).length;
    },

    async remove(id: string): Promise<void> {
      await store.delete(id);
    },

    /**
     * Replay every queued entry once, oldest first. On success or permanent
     * rejection the entry is removed; on a retryable error it is kept with an
     * incremented attempt count (dropped once it exceeds MAX_ATTEMPTS, reported
     * via permanentlyFailed so the UI can warn the operator). Sequential by
     * design: order matters (a table's orders should replay in sequence) and it
     * avoids hammering a just-recovered network.
     */
    async drain(replay: ReplayFn): Promise<DrainResult> {
      const entries = await this.list();
      let succeeded = 0;
      const permanentlyFailed: OutboxEntry[] = [];

      for (const entry of entries) {
        let outcome: ReplayOutcome;
        try {
          outcome = await replay(entry);
        } catch (err) {
          // A thrown replay is treated as network-unreachable: keep, don't burn.
          outcome = {
            kind: 'retry',
            reason: err instanceof Error ? err.message : String(err),
            countsAsAttempt: false,
          };
        }

        // Isolate each entry's store mutation: one IndexedDB hiccup must not
        // abort the rest of the batch (the entry just gets retried next drain).
        try {
          if (outcome.kind === 'success') {
            await store.delete(entry.id);
            succeeded += 1;
            continue;
          }

          if (outcome.kind === 'permanent') {
            await store.delete(entry.id);
            permanentlyFailed.push({ ...entry, lastError: outcome.reason });
            continue;
          }

          // retryable: only count toward the attempt budget when the server
          // actually answered (countsAsAttempt !== false). Pure network failures
          // keep the entry indefinitely without dropping it.
          if (outcome.countsAsAttempt === false) {
            await store.put({ ...entry, lastError: outcome.reason });
            continue;
          }
          const attempts = entry.attempts + 1;
          if (attempts > MAX_ATTEMPTS) {
            await store.delete(entry.id);
            permanentlyFailed.push({ ...entry, attempts, lastError: outcome.reason });
            continue;
          }
          await store.put({ ...entry, attempts, lastError: outcome.reason });
        } catch {
          // Store op failed for this entry; leave it queued and move on.
          continue;
        }
      }

      const stillQueued = (await store.getAll()).length;
      return { succeeded, permanentlyFailed, stillQueued };
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
