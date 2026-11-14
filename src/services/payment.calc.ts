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

/**
 * Moyen de paiement a inscrire sur `orders.payment_method` quand la commande
 * devient soldee par le registre. Regle: on calcule le net par moyen
 * (encaissements moins remboursements de ce moyen) et on retient le moyen au
 * plus grand net strictement positif; a egalite, celui dont le dernier
 * mouvement est le plus recent (le registre arrive trie par date croissante).
 * Un moyen entierement rembourse ne peut donc pas l'emporter. Renvoie null si
 * aucun moyen n'a de net positif.
 */
export function dominantMethod(tenders: PaymentTender[]): string | null {
  const net = new Map<string, number>();
  for (const tender of tenders) {
    const signed = tender.status === 'refunded' ? -tender.amount : tender.amount;
    // Reinsertion: l'ordre de la Map suit le dernier mouvement de chaque moyen.
    const total = (net.get(tender.method) ?? 0) + signed;
    net.delete(tender.method);
    net.set(tender.method, total);
  }
  let best: string | null = null;
  let bestNet = 0;
  for (const [method, total] of net) {
    if (total > 0 && total >= bestNet) {
      best = method;
      bestNet = total;
    }
  }
  return best;
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
