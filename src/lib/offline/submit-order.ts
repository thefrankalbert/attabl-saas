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
import type { ReplayOutcome, Outbox } from './outbox';

/** Dispatched on window after an order is queued, so the outbox UI updates now. */
export const OUTBOX_CHANGED_EVENT = 'attabl:outbox-changed';

/** HTTP status -> what the outbox should do with the entry. */
function classifyStatus(status: number): 'success' | 'permanent' | 'retry' {
  if (status >= 200 && status < 300) return 'success';
  // Auth failures are transient for a queued order: an offline tablet's session
  // can expire mid-outage, then recover (refresh / re-login). Dropping a real
  // paid order on a 401/403 would lose it - keep and retry instead.
  if (status === 401 || status === 403) return 'retry';
  // Timeout, payload-too-large (often an edge/proxy limit), and rate limit are
  // transient: keep and retry later.
  if (status === 408 || status === 413 || status === 429) return 'retry';
  // Server-side failure: transient, retry.
  if (status >= 500) return 'retry';
  // Other 4xx = business rejection (validation, price, coupon, conflict): the
  // same body will be rejected again, so do not keep replaying it.
  return 'permanent';
}

export type SubmitResult =
  | { status: 'sent'; data: unknown }
  | { status: 'queued' } // accepted into the durable outbox; will sync later
  | { status: 'rejected'; error: string; details?: string[] } // server refused
  | { status: 'failed'; error: string }; // could not send AND could not queue

interface OrderResponseBody {
  error?: string;
  details?: string[];
}

async function readJson(response: Response): Promise<OrderResponseBody & Record<string, unknown>> {
  try {
    return (await response.json()) as OrderResponseBody & Record<string, unknown>;
  } catch {
    return {};
  }
}

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

/** Drain-side replay of one queued order entry. */
export async function replayOrderEntry(
  entry: { endpoint: string; body: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<ReplayOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(entry.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry.body),
    });
  } catch (err) {
    // Could not reach the server at all (offline / captive portal / DNS). This
    // is NOT the order's fault, so it must not count toward the attempt budget -
    // otherwise a long outage would drop the very orders the outbox exists to
    // protect.
    return {
      kind: 'retry',
      reason: err instanceof Error ? err.message : 'network',
      countsAsAttempt: false,
    };
  }

  const verdict = classifyStatus(response.status);
  if (verdict === 'success') return { kind: 'success' };
  if (verdict === 'retry') {
    // The server answered but with a transient status: this DOES count toward
    // the attempt budget (so a server that keeps rejecting eventually gives up).
    return { kind: 'retry', reason: `http_${response.status}`, countsAsAttempt: true };
  }
  const errBody = await readJson(response);
  return { kind: 'permanent', reason: errBody.error ?? `http_${response.status}` };
}
