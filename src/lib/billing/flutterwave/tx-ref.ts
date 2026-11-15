import { randomBytes } from 'node:crypto';
import type { BillingInterval, SubscriptionPlan } from '@/types/billing';

/**
 * Reference de transaction: `atb_<tenant>_<plan>_<periode>_<nonce>`.
 *
 * Elle porte le restaurant, le plan et la periode payee, plus un nonce qui rend
 * chaque tentative unique. La reference seule ne prouve RIEN: la ligne
 * `flutterwave_payments` creee avant l'appel a Flutterwave reste la source de
 * verite du prix attendu. Le format sert a rejeter vite une reference etrangere
 * et a recouper le restaurant.
 */
const TX_REF_PATTERN =
  /^atb_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(starter|pro|business)_(monthly|yearly)_([0-9a-f]{16})$/;

export interface ParsedTxRef {
  tenantId: string;
  plan: Exclude<SubscriptionPlan, 'enterprise'>;
  interval: BillingInterval;
  nonce: string;
}

export function buildTxRef(
  tenantId: string,
  plan: ParsedTxRef['plan'],
  interval: BillingInterval,
  nonce: string = randomBytes(8).toString('hex'),
): string {
  return `atb_${tenantId}_${plan}_${interval}_${nonce}`;
}

export function parseTxRef(txRef: string): ParsedTxRef | null {
  const match = TX_REF_PATTERN.exec(txRef);
  if (!match) return null;
  return {
    tenantId: match[1],
    plan: match[2] as ParsedTxRef['plan'],
    interval: match[3] as BillingInterval,
    nonce: match[4],
  };
}
