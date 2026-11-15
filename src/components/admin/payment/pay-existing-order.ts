import { submitOrder } from '@/lib/offline/submit-order';

export type PayExistingOutcome =
  | { kind: 'paid' }
  /** The order was already settled (double tap, another cashier): nothing taken twice. */
  | { kind: 'alreadySettled' }
  /** Offline: durably queued, replayed (deduplicated) when the network returns. */
  | { kind: 'queued' }
  | { kind: 'error'; message: string };

/**
 * Settles an existing order (OFF-05). It used to call actionMarkOrderPaid
 * directly, outside the outbox: a network cut failed it with a red toast while
 * the cashier already held the money, and the table stayed open. The idempotent
 * endpoint queues offline and dedupes on replay - essential since markPaid
 * writes to the payments ledger. The caller keeps `clientRequestId` until the
 * payment went through, so a second tap after a failure replays the same key
 * instead of collecting twice. `tipMinor` is in integer MINOR units.
 */
export async function payExistingOrder(
  orderId: string,
  method: string,
  tipMinor: number | undefined,
  clientRequestId: string,
): Promise<PayExistingOutcome> {
  const result = await submitOrder({
    endpoint: '/api/orders/mutations',
    clientRequestId,
    body: { type: 'pay', orderId, method, tipMinor },
  });
  if (result.status === 'rejected' || result.status === 'failed') {
    return { kind: 'error', message: result.error };
  }
  if (result.status === 'queued') return { kind: 'queued' };
  return (result.data as { paid?: boolean } | null)?.paid === false
    ? { kind: 'alreadySettled' }
    : { kind: 'paid' };
}
