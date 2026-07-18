/**
 * Order submission through the durable outbox (browser-only).
 *
 * submitOrder posts an order and, when the network is unreachable or the server
 * is transiently failing, queues it in IndexedDB to replay on reconnect. The
 * client_request_id makes every replay idempotent server-side (migration
 * 20260628010000), so a queued-then-sent order never duplicates.
 *
 * replayOrderEntry is the drain-side counterpart: it re-posts a queued entry and
 * classifies the response so the outbox knows whether to drop, retry, or give up.
 */

import { getOrderOutbox } from './outbox-idb';
import type { Outbox } from './outbox';
import { classifyStatus, readJson, replayOrderEntry, OUTBOX_SYNC_TAG } from './outbox-replay';

// replayOrderEntry / OUTBOX_SYNC_TAG live in the DOM-free outbox-replay module so
// they can also run inside the service worker. Re-exported here to keep the
// existing import path (`@/lib/offline/submit-order`) stable for page consumers.
export { replayOrderEntry, OUTBOX_SYNC_TAG };

/** Dispatched on window after an order is queued, so the outbox UI updates now. */
export const OUTBOX_CHANGED_EVENT = 'attabl:outbox-changed';

/**
 * Best-effort registration of a Background Sync so the service worker replays
 * the outbox when connectivity returns, even if no tab is open. Silently no-ops
 * where SyncManager is unavailable (Safari/iOS) - the page-side interval/online
 * drain in useOrderOutbox remains the fallback.
 */
async function registerOutboxSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Only when a SW already controls this page. `navigator.serviceWorker.ready`
  // NEVER resolves when no worker ever activates (dev mode, incognito, blocked
  // registration, pre-activation) - awaiting it there would hang forever. The
  // controller check short-circuits that case; the interval/online drain in
  // useOrderOutbox is the fallback.
  if (!navigator.serviceWorker.controller) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Ignore: no Background Sync support, or registration blocked. The fallback
    // drain paths still flush the outbox.
  }
}

export type SubmitResult =
  | { status: 'sent'; data: unknown }
  | { status: 'queued' } // accepted into the durable outbox; will sync later
  | { status: 'rejected'; error: string; details?: string[] } // server refused
  | { status: 'failed'; error: string }; // could not send AND could not queue

export interface SubmitOrderArgs {
  endpoint: string;
  /** Body WITHOUT the key; client_request_id is injected here. */
  body: Record<string, unknown>;
  clientRequestId: string;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  outbox?: Outbox | null;
  now?: number;
}

export async function submitOrder({
  endpoint,
  body,
  clientRequestId,
  fetchImpl = fetch,
  outbox = getOrderOutbox(),
  now = Date.now(),
}: SubmitOrderArgs): Promise<SubmitResult> {
  const fullBody = { ...body, client_request_id: clientRequestId };

  const queue = async (reason: string): Promise<SubmitResult> => {
    if (!outbox) {
      // No durable store (SSR / IndexedDB blocked): cannot guarantee the write,
      // so surface a failure rather than silently dropping the order.
      return { status: 'failed', error: reason };
    }
    await outbox.enqueue({ id: clientRequestId, endpoint, body: fullBody, now });
    // Nudge any mounted outbox UI to refresh its count / attempt a drain.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT));
    }
    // Ask the service worker to replay the outbox via Background Sync when the
    // network returns - covers the case where the tab is closed during the
    // outage. Fire-and-forget: the order is already durably queued, so the
    // return must not wait on (or hang behind) SW readiness. Browsers without
    // SyncManager (e.g. Safari/iOS) fall back to the interval/online drain.
    void registerOutboxSync();
    return { status: 'queued' };
  };

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullBody),
    });
  } catch {
    // Offline / DNS / connection refused: durable-queue it.
    return queue('network');
  }

  const verdict = classifyStatus(response.status);
  if (verdict === 'success') {
    return { status: 'sent', data: await readJson(response) };
  }
  if (verdict === 'permanent') {
    const errBody = await readJson(response);
    return {
      status: 'rejected',
      error: errBody.error ?? `Erreur ${response.status}`,
      details: errBody.details,
    };
  }
  // transient (5xx / 429 / 408): queue for replay
  return queue(`http_${response.status}`);
}
