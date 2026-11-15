import { createAdminClient } from '@/lib/supabase/admin';
import { createEmailService } from '@/services/email.service';
import { createFlutterwaveBillingService } from '@/services/flutterwave-billing.service';
import {
  createFlutterwaveRenewalService,
  type RenewalRunResult,
} from '@/services/flutterwave-renewal.service';
import { createFlutterwaveClient } from './client';
import { getFlutterwaveConfig, type FlutterwaveConfig } from './config';

/** Origine publique, meme regle que la route Stripe. */
export function appBaseUrl(): string {
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
