import { vi } from 'vitest';
import { createFlutterwaveBillingService } from '../../flutterwave-billing.service';
import { createFlutterwaveReconciliationService } from '../../flutterwave-reconciliation.service';
import { buildTxRef } from '@/lib/billing/flutterwave/tx-ref';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import type { VerifiedTransaction } from '@/lib/billing/flutterwave/schemas';
import { createFakeSupabase, type Result } from './fake-supabase';

/**
 * Jeu de donnees commun aux tests des anomalies Flutterwave (SM10, cote
 * encaissement) et du rapprochement (SM8). Le logger doit etre simule par le
 * fichier de test qui importe ce module.
 */

export const NOW = new Date('2026-11-15T10:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;
export const TENANT_A = '11111111-2222-3333-4444-555555555555';
export const REF = buildTxRef(TENANT_A, 'pro', 'monthly', 'aaaaaaaaaaaaaaaa');

export type Row = Record<string, unknown>;
export const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

export function tenant(overrides: Row = {}): Row {
  return {
    id: TENANT_A,
    slug: 'chez-awa',
    name: 'Chez Awa',
    currency: 'XOF',
    subscription_status: 'active',
    subscription_plan: 'pro',
    subscription_current_period_end: iso(20 * DAY),
    stripe_subscription_id: null,
    freeze_reason: null,
    suspended_at: null,
    deleted_at: null,
    ...overrides,
  };
}

export function payment(overrides: Row = {}): Row {
  return {
    id: 'pay-1',
    tenant_id: TENANT_A,
    tx_ref: REF,
    plan: 'pro',
    billing_interval: 'monthly',
    amount: 79000,
    currency: 'XOF',
    status: 'pending',
    flw_transaction_id: null,
    period_end: null,
    last_checked_at: null,
    created_at: iso(-DAY),
    ...overrides,
  };
}

export function setup(
  opts: {
    tenants?: Row[];
    payments?: Row[];
    rpc?: () => Result;
    anomalyWriteFails?: boolean;
  } = {},
) {
  const fake = createFakeSupabase(
    { tenants: opts.tenants ?? [tenant()], flutterwave_payments: opts.payments ?? [payment()] },
    {
      uniques: { flutterwave_anomalies: ['cle'] },
      failWrite: (table) => opts.anomalyWriteFails === true && table === 'flutterwave_anomalies',
      rpc: {
        apply_flutterwave_payment:
          opts.rpc ?? (() => ({ data: { outcome: 'duplicate' }, error: null })),
      },
    },
  );
  // Le faux client ne connait pas les uniques composites: on simule
  // UNIQUE (flw_transaction_id, kind) par une colonne calculee a l'insert.
  const from = fake.client.from.bind(fake.client);
  (fake.client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
    const q = from(table) as unknown as { insert: (p: Row) => unknown };
    if (table !== 'flutterwave_anomalies') return q;
    const insert = q.insert.bind(q);
    q.insert = (p: Row) =>
      insert({ ...p, cle: `${String(p.flw_transaction_id)}:${String(p.kind)}` });
    return q;
  };
  const client: FlutterwaveClient = {
    createPaymentLink: vi.fn(),
    verifyTransaction: vi.fn(),
    verifyByReference: vi.fn(),
    listTransactionsByReference: vi.fn().mockResolvedValue([]),
  };
  const service = createFlutterwaveBillingService(fake.client, {
    client,
    baseUrl: 'https://attabl.com',
    retrieveStripeStatus: vi.fn().mockResolvedValue(null),
    now: () => NOW,
  });
  const reconciliation = createFlutterwaveReconciliationService(fake.client, {
    client,
    now: () => NOW,
  });
  const anomalies = () => fake.db.flutterwave_anomalies ?? [];
  return { ...fake, client, service, reconciliation, anomalies };
}

export function tx(overrides: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    id: 7002,
    tx_ref: REF,
    status: 'successful',
    amount: 79000,
    currency: 'XOF',
    ...overrides,
  };
}
