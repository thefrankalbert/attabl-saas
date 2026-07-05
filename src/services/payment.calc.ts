import type { PaymentStatus } from '@/types/admin.types';
import type { PaymentOrderRow, PaymentSummary, PaymentTender } from './payment.types';

/**
 * Pure payment calculations derived from the ledger. No I/O, no Supabase - these
 * are plain integer-arithmetic functions over minor-unit amounts, extracted from
 * payment.service.ts so the factory stays the orchestrator.
 */

/**
 * Amount owed for an order: total (excl. tip per project convention) + tip,
 * in integer minor units. Both columns are already minor integers, so this is
 * a plain integer add (Math.round is a defensive no-op against any stray
 * non-integer that slipped in).
 */
export function dueFor(
  order: Pick<PaymentOrderRow, 'total' | 'tip_amount' | 'display_currency'>,
): number {
  return Math.round(Number(order.total || 0) + Number(order.tip_amount || 0));
}

/**
 * Derive payment_status from the ledger:
 *   net <= 0 && refunded > 0 -> 'refunded'  (money came in then was given back)
 *   net <= 0                 -> 'pending'    (nothing settled yet)
 *   net < due                -> 'partial'    (some settled, balance remaining)
 *   else                     -> 'paid'       (fully settled)
 * All inputs are integer minor units, so the comparison is exact - no rounding
 * needed (integer minor amounts cannot carry sub-unit float drift).
 */
export function deriveStatus(net: number, refunded: number, due: number): PaymentStatus {
  if (net <= 0 && refunded > 0) return 'refunded';
  if (net <= 0) return 'pending';
  if (net < due) return 'partial';
  return 'paid';
}

export function summarize(order: PaymentOrderRow, tenders: PaymentTender[]): PaymentSummary {
  const completed = tenders
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  const refunded = tenders
    .filter((t) => t.status === 'refunded')
    .reduce((sum, t) => sum + t.amount, 0);
  const net = completed - refunded;
  const due = dueFor(order);

  // A comped order (offert) is closed for FREE: its stored payment_status is
  // authoritative and must NOT be re-derived from the (empty) ledger. Without
  // this short-circuit deriveStatus would relabel it 'pending' and silently
  // revert the comp. Comp is columns-only on orders - never a payments row.
  const paymentStatus: PaymentStatus =
    order.payment_status === 'comp' ? 'comp' : deriveStatus(net, refunded, due);

  return {
    orderId: order.id,
    due,
    completed,
    refunded,
    net,
    paymentStatus,
    tenders,
  };
}
