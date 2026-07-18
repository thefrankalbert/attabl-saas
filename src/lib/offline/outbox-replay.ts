/**
 * Drain-side replay of queued order entries - isomorphic and DOM-free.
 *
 * This module deliberately references NO window/DOM globals (only fetch +
 * Response), so it can be bundled into the service worker (src/app/sw.ts) for
 * Background Sync as well as run on the page. Keeping it separate from
 * submit-order.ts (which touches `window`) is what lets the SW type-check under
 * the WebWorker lib without pulling in DOM types.
 */

import type { ReplayOutcome } from './outbox';

/** Background Sync tag the SW listens on to drain the outbox on reconnect. */
export const OUTBOX_SYNC_TAG = 'attabl-outbox';

/** HTTP status -> what the outbox should do with the entry. */
export function classifyStatus(status: number): 'success' | 'permanent' | 'retry' {
  if (status >= 200 && status < 300) return 'success';
  // Auth failures are transient for a queued order: an offline tablet's session
  // can expire mid-outage, then recover (refresh / re-login). Dropping a real
  // paid order on a 401/403 would lose it - keep and retry instead.
  if (status === 401 || status === 403) return 'retry';
  // Timeout, conflict, payload-too-large (often an edge/proxy limit), and rate
  // limit are transient: keep and retry later. 409 is what
  // /api/orders/mutations answers while a concurrent replay of the SAME
  // client_request_id is still in flight - the next drain resolves it.
  if (status === 408 || status === 409 || status === 413 || status === 429) return 'retry';
  // Server-side failure: transient, retry.
  if (status >= 500) return 'retry';
  // Other 4xx = business rejection (validation, price, coupon, conflict): the
  // same body will be rejected again, so do not keep replaying it.
  return 'permanent';
}

export interface OrderResponseBody {
  error?: string;
  details?: string[];
}

export async function readJson(
  response: Response,
): Promise<OrderResponseBody & Record<string, unknown>> {
  try {
    return (await response.json()) as OrderResponseBody & Record<string, unknown>;
  } catch {
    return {};
  }
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
    // All server-answered transient statuses (401/403/408/413/429/5xx) count
    // toward the bounded attempt budget. This is deliberate for 401/403 too:
    // on reconnect Supabase refreshes the session BEFORE the outbox drains, so a
    // replay almost never sees 401; when it does, it means the refresh failed or
    // the request is genuinely forbidden - both must eventually give up and
    // surface (permanentlyFailed) instead of becoming an immortal entry that is
    // re-POSTed forever. MAX_ATTEMPTS is generous enough (drains spread over
    // mount/online/refocus/15s-interval) that a recoverable session survives.
    return { kind: 'retry', reason: `http_${response.status}`, countsAsAttempt: true };
  }
  const errBody = await readJson(response);
  return { kind: 'permanent', reason: errBody.error ?? `http_${response.status}` };
}
