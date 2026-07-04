/**
 * Single source of truth for "what counts as restaurant revenue".
 *
 * Revenue = orders that were actually PAID (payment_status = 'paid'), gross of tip.
 * Before this, the product had three contradictory definitions (dashboard headline
 * filtered status='delivered', the charts counted every order, the reporting RPCs
 * filtered status != 'cancelled') so the same period reported different numbers and
 * unpaid/pending orders inflated the top line. Everything that reports money must go
 * through these helpers (and the matching RPC predicate payment_status='paid').
 *
 * orders.total is stored EXCLUDING tip (see api/orders/route.ts and
 * api/orders/pos/route.ts); tip lives in tip_amount. Gross revenue = total + tip.
 *
 * MONEY UNITS: orders.total and orders.tip_amount are integer MINOR units (the
 * currency's smallest unit). These helpers sum minor amounts and return a minor
 * integer - callers that DISPLAY the result must convert with fromMinorUnits /
 * formatCurrencyMinor (src/lib/utils/money.ts). No re-rounding to major here.
 */

const PAID_PAYMENT_STATUS = 'paid';

export interface RevenueOrder {
  payment_status?: string | null;
  total?: number | null;
  tip_amount?: number | null;
}

/** True when an order has been settled (its money is recognized revenue). */
export function isPaidOrder(o: { payment_status?: string | null }): boolean {
  return o.payment_status === PAID_PAYMENT_STATUS;
}

/** Gross amount of one order, tip included. Not revenue unless the order is paid. */
export function orderGross(o: RevenueOrder): number {
  return Number(o.total || 0) + Number(o.tip_amount || 0);
}

/** Sum of gross amounts across only the PAID orders in the list. */
export function sumPaidRevenue(orders: RevenueOrder[]): number {
  return orders.reduce((sum, o) => (isPaidOrder(o) ? sum + orderGross(o) : sum), 0);
}
