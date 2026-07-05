import type { PaymentStatus } from '@/types/admin.types';

/**
 * Shared types and constants for the payment service (split / partial / refund
 * tenders, comp). Extracted from payment.service.ts so the factory stays the
 * orchestrator. No behaviour lives here - types and one column list only.
 *
 * MONEY UNITS: every amount here (orders.total, orders.tip_amount,
 * payments.amount, and the derived due/net/completed/refunded) is an integer in
 * the currency's MINOR units. Comparisons and sums are plain integer arithmetic -
 * no per-currency rounding is needed (an integer minor amount is already exact).
 */

/** Minimal order shape needed to compute what is owed and to recompute status. */
export interface PaymentOrderRow {
  id: string;
  total: number | null;
  tip_amount: number | null;
  display_currency: string | null;
  payment_status: string | null;
  paid_at: string | null;
  session_id: string | null;
  status: string | null;
}

/** One tender row from the ledger. */
export interface PaymentTender {
  id: string;
  amount: number;
  method: string;
  status: 'completed' | 'refunded';
  createdBy: string | null;
  createdAt: string;
}

/** Aggregated payment state for an order, derived from the ledger. */
export interface PaymentSummary {
  orderId: string;
  /** Amount owed = total (excl. tip) + tip, in integer minor units. */
  due: number;
  /** Sum of completed tenders. */
  completed: number;
  /** Sum of refunded tenders. */
  refunded: number;
  /** completed - refunded. */
  net: number;
  paymentStatus: PaymentStatus;
  tenders: PaymentTender[];
}

export interface TenderInput {
  amount: number;
  method: string;
  createdBy?: string | null;
}

export interface CompInput {
  /** Free-text reason (Zod-validated upstream). */
  reason: string;
  /** admin_users.id of the manager offering the order (NOT the auth user id). */
  compedBy?: string | null;
}

/**
 * Result of a comp attempt. `comped` is true when a state transition actually
 * happened; false on an idempotent replay (the order was already 'comp'), which
 * lets the action skip a second audit-log side-effect.
 */
export interface CompResult {
  summary: PaymentSummary;
  comped: boolean;
}

export const ORDER_COLUMNS =
  'id, total, tip_amount, display_currency, payment_status, paid_at, session_id, status';
