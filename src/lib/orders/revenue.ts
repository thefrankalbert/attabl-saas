/**
 * Single source of truth for "what counts as restaurant revenue".
 *
 * Revenue = money actually RECEIVED, read from the `payments` ledger: every
 * 'completed' row adds its amount, every 'refunded' row subtracts it (a refund
 * is stored as its own row with a POSITIVE amount, see record_refund). A row
 * counts on the day it was recorded (`payments.created_at`), tip included.
 *
 * Owner decision 2026-11-12 (audit C-041): "encaisse aujourd'hui" = money
 * received today. Before, revenue summed orders whose payment_status was
 * 'paid', so a deposit on an open table and a partially refunded order both
 * vanished from the figure (measured: 6 500 shown, 9 000 in the ledger).
 *
 * The same predicate lives in the reporting RPCs (migration 20261112140000):
 * anything that reports money goes through these helpers or those RPCs.
 *
 * MONEY UNITS: payments.amount is an integer in MINOR units. These helpers sum
 * minor amounts and return a minor integer; callers that DISPLAY the result
 * convert with fromMinorUnits / formatCurrencyMinor (src/lib/utils/money.ts).
 */

export interface LedgerRow {
  amount?: number | null;
  status?: string | null;
}

/** Signed value of one ledger row: + received, - refunded. */
export function ledgerValue(row: LedgerRow): number {
  const amount = Number(row.amount || 0);
  return row.status === 'refunded' ? -amount : amount;
}

/** Net money received across the rows (received minus refunded). */
export function sumLedgerNet(rows: LedgerRow[]): number {
  return rows.reduce((sum, row) => sum + ledgerValue(row), 0);
}

/**
 * Average ticket = net received / number of distinct orders that received a
 * payment in the rows (minor units, rounded). A table that pays in two
 * tenders is one ticket, not two.
 */
export function averageLedgerTicket(rows: Array<LedgerRow & { order_id?: string | null }>): number {
  const paidOrders = new Set(
    rows.filter((r) => r.status !== 'refunded' && r.order_id).map((r) => r.order_id),
  );
  return paidOrders.size > 0 ? Math.round(sumLedgerNet(rows) / paidOrders.size) : 0;
}

/**
 * Orders that received money (fully or in part): the population used by the
 * product-mix views (top dishes, categories). 'refunded' and 'pending' are
 * excluded, 'partial' is kept (a deposit or a partial refund).
 */
export const PAYMENT_STATUSES_WITH_MONEY = ['paid', 'partial'] as const;
