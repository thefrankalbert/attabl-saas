import { createAdminClient } from '@/lib/supabase/admin';
import { createEmailService } from '@/services/email.service';
import { createFlutterwaveBillingService } from '@/services/flutterwave-billing.service';
import { createFlutterwaveReconciliationService } from '@/services/flutterwave-reconciliation.service';
import {
  createFlutterwaveRenewalService,
  type RenewalRunResult,
} from '@/services/flutterwave-renewal.service';
import { retrieveStripeSubscriptionStatus } from '@/lib/billing/stale-subscription';
import { createFlutterwaveClient } from './client';
import { getFlutterwaveConfig, type FlutterwaveConfig } from './config';

/** Origine publique, meme regle que la route Stripe. */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://attabl.com')
  );
}

/** Assemble le service d'encaissement, ou `null` si les cles sont absentes (fonctionnalite eteinte). */
export function buildFlutterwaveBilling(): {
  config: FlutterwaveConfig;
  billing: ReturnType<typeof createFlutterwaveBillingService>;
} | null {
  const config = getFlutterwaveConfig();
  if (!config) return null;
  const billing = createFlutterwaveBillingService(createAdminClient(), {
    client: createFlutterwaveClient(config.secretKey),
    baseUrl: appBaseUrl(),
    retrieveStripeStatus: retrieveStripeSubscriptionStatus,
  });
  return { config, billing };
}

/** Rappels + gel des echeances Flutterwave. `null` quand la fonctionnalite est eteinte. */
export async function runFlutterwaveRenewals(): Promise<RenewalRunResult | null> {
  const wired = buildFlutterwaveBilling();
  if (!wired) return null;
  return createFlutterwaveRenewalService(createAdminClient(), {
    billing: wired.billing,
    email: createEmailService(),
  }).run();
}

/**
 * Rattrapage des tentatives `pending` non confirmees par webhook, puis
 * rapprochement des paiements deja regles avec Flutterwave (audit SM8).
 * `null` quand la fonctionnalite est eteinte.
 */
export async function runFlutterwaveReconcile(): Promise<{
  checked: number;
  applied: number;
  errors: number;
  settledChecked: number;
  anomalies: number;
  settledErrors: number;
} | null> {
  const wired = buildFlutterwaveBilling();
  if (!wired) return null;
  const pending = await wired.billing.reconcilePending();
  const settled = await createFlutterwaveReconciliationService(createAdminClient(), {
    client: createFlutterwaveClient(wired.config.secretKey),
  }).reconcileSettled();
  return { ...pending, ...settled };
}
