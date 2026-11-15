import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PLAN_NAMES } from '@/lib/plans/features';
import { PLAN_TOTALS } from '@/lib/billing/pricing';
import { FREEZE_REASONS, updateTolerantToMissingFreezeReason } from '@/lib/billing/freeze-reason';
import type { BillingInterval } from '@/types/billing';
import type { EmailService } from './email.types';
import type { FlutterwaveBillingService } from './flutterwave-billing.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Jours de grace apres la fin de la periode payee, avant le gel.
 * Le mobile money n'a aucune relance automatique: le client paie quand il y
 * pense. Trois jours couvrent un week-end sans servir gratuitement trop long.
 */
export const FLUTTERWAVE_GRACE_DAYS = 3;

/** Rappels envoyes: 7 jours puis 1 jour avant la fin de periode. */
const REMINDER_WINDOWS = [
  { key: 'd1', maxDays: 1 },
  { key: 'd7', maxDays: 7 },
] as const;

const MAX_OWNERS_PER_TENANT = 3;
const MAX_TENANTS_PER_RUN = 200;

interface RenewalTenant {
  id: string;
  subscription_plan: string | null;
  billing_interval: BillingInterval | null;
  subscription_current_period_end: string;
  activation_events: Record<string, string> | null;
}

export interface RenewalRunResult {
  reminded: number;
  skipped: number;
  frozen: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function isPayablePlan(plan: string | null): plan is 'starter' | 'pro' | 'business' {
  return plan === 'starter' || plan === 'pro' || plan === 'business';
}

/**
 * Horloge de periode des abonnements Flutterwave, portee par ATTABL:
 *   1. rappels par courriel 7 jours puis 1 jour avant l'echeance, avec un lien
 *      de paiement frais;
 *   2. gel apres l'echeance + delai de grace.
 *
 * Un restaurant n'est concerne que s'il a deja regle au moins un paiement
 * Flutterwave: ni les essais (cron `freeze-expired-trials`) ni les abonnes
 * Stripe (webhook) ne sont touches. Les rappels sont dedupliques par une cle
 * `fw_renewal_<d7|d1>_<date d'echeance>` dans `activation_events`.
 */
export function createFlutterwaveRenewalService(
  supabase: SupabaseClient,
  deps: {
    billing: Pick<FlutterwaveBillingService, 'startPayment'>;
    email: Pick<EmailService, 'sendRenewalReminderEmail'>;
    now?: () => Date;
  },
) {
  const now = deps.now ?? (() => new Date());

  /** Parmi ces restaurants, ceux qui ont deja paye par Flutterwave. */
  async function paidWithFlutterwave(tenantIds: string[]): Promise<Set<string>> {
    if (tenantIds.length === 0) return new Set();
    const { data, error } = await supabase
      .from('flutterwave_payments')
      .select('tenant_id')
      .in('tenant_id', tenantIds)
      .eq('status', 'successful');
    if (error) throw new Error('Lecture des paiements Flutterwave impossible');
    return new Set((data ?? []).map((row: { tenant_id: string }) => row.tenant_id));
  }

  async function ownerEmails(tenantId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('admin_users')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .eq('is_active', true)
      .limit(MAX_OWNERS_PER_TENANT);
    if (error) return [];
    return (data ?? [])
      .map((row: { email: string | null }) => row.email)
      .filter((email: string | null): email is string => !!email);
  }

  async function remindOne(tenant: RenewalTenant): Promise<boolean> {
    if (!isPayablePlan(tenant.subscription_plan)) return false;
    const interval: BillingInterval = tenant.billing_interval ?? 'monthly';
    const msLeft = new Date(tenant.subscription_current_period_end).getTime() - now().getTime();
    const events = tenant.activation_events ?? {};
    const endDay = tenant.subscription_current_period_end.slice(0, 10);

    // Le rappel le plus proche de l'echeance dont la fenetre est ouverte et pas encore envoye.
    const due = REMINDER_WINDOWS.find(
      (w) => msLeft <= w.maxDays * DAY_MS && !events[`fw_renewal_${w.key}_${endDay}`],
    );
    if (!due) return false;
    // Une fois d1 envoye, d7 ne doit plus partir, meme s'il n'avait jamais ete envoye.
    if (due.key === 'd7' && events[`fw_renewal_d1_${endDay}`]) return false;

    const recipients = await ownerEmails(tenant.id);
    if (recipients.length === 0) return false;

    const payment = await deps.billing.startPayment({
      tenantId: tenant.id,
      customerEmail: recipients[0],
      plan: tenant.subscription_plan,
      interval,
    });
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant.id)
      .maybeSingle();

    let sent = 0;
    for (const to of recipients) {
      const result = await deps.email.sendRenewalReminderEmail(to, {
        restaurantName: (tenantRow as { name?: string } | null)?.name ?? 'Votre restaurant',
        paymentUrl: payment.link,
        daysLeft: Math.max(1, Math.ceil(msLeft / DAY_MS)),
        periodEndLabel: formatDate(tenant.subscription_current_period_end),
        amount: PLAN_TOTALS[tenant.subscription_plan][interval],
        planLabel: PLAN_NAMES[tenant.subscription_plan],
      });
      if (result.success) sent += 1;
    }
    if (sent === 0) return false;

    const { error } = await supabase
      .from('tenants')
      .update({
        activation_events: {
          ...events,
          [`fw_renewal_${due.key}_${endDay}`]: now().toISOString(),
        },
      })
      .eq('id', tenant.id);
    if (error) {
      logger.error('Flutterwave: rappel envoye mais non memorise', error, { tenantId: tenant.id });
    }
    return true;
  }

  async function sendReminders(): Promise<{ reminded: number; skipped: number }> {
    const horizon = new Date(now().getTime() + 7 * DAY_MS).toISOString();
    const { data, error } = await supabase
      .from('tenants')
      .select(
        'id, subscription_plan, billing_interval, subscription_current_period_end, activation_events',
      )
      .eq('subscription_status', 'active')
      .is('stripe_subscription_id', null)
      .is('deleted_at', null)
      .is('suspended_at', null)
      .gt('subscription_current_period_end', now().toISOString())
      .lte('subscription_current_period_end', horizon)
      .order('subscription_current_period_end', { ascending: true })
      .limit(MAX_TENANTS_PER_RUN);
    if (error) throw new Error('Lecture des echeances impossible');

    const candidates = (data ?? []) as RenewalTenant[];
    const paid = await paidWithFlutterwave(candidates.map((t) => t.id));

    let reminded = 0;
    let skipped = 0;
    for (const tenant of candidates) {
      if (!paid.has(tenant.id)) continue;
      try {
        if (await remindOne(tenant)) reminded += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        logger.error('Flutterwave: rappel impossible', err, { tenantId: tenant.id });
      }
    }
    return { reminded, skipped };
  }

  async function freezeOverdue(): Promise<number> {
    const cutoff = new Date(now().getTime() - FLUTTERWAVE_GRACE_DAYS * DAY_MS).toISOString();
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('subscription_status', 'active')
      .is('stripe_subscription_id', null)
      .is('deleted_at', null)
      .lt('subscription_current_period_end', cutoff)
      .order('subscription_current_period_end', { ascending: true })
      .limit(MAX_TENANTS_PER_RUN);
    if (error) throw new Error('Lecture des echeances depassees impossible');

    const ids = ((data ?? []) as { id: string }[]).map((t) => t.id);
    const paid = await paidWithFlutterwave(ids);
    const overdue = ids.filter((id) => paid.has(id));
    if (overdue.length === 0) return 0;

    const { data: frozen, error: freezeError } = await updateTolerantToMissingFreezeReason(
      {
        subscription_status: 'frozen',
        is_active: false,
        freeze_reason: FREEZE_REASONS.FLUTTERWAVE_UNPAID,
      },
      (payload) =>
        supabase
          .from('tenants')
          .update(payload)
          .in('id', overdue)
          // Re-verifie a l'ecriture: un paiement peut etre tombe entre la lecture et ici.
          .eq('subscription_status', 'active')
          .lt('subscription_current_period_end', cutoff)
          .select('id'),
      { cause: FREEZE_REASONS.FLUTTERWAVE_UNPAID },
    );
    if (freezeError) throw new Error('Gel des abonnements Flutterwave impossible');
    return Array.isArray(frozen) ? frozen.length : 0;
  }

  return {
    sendReminders,
    freezeOverdue,
    async run(): Promise<RenewalRunResult> {
      const reminders = await sendReminders();
      const frozen = await freezeOverdue();
      logger.info('Flutterwave: renouvellements traites', { ...reminders, frozen });
      return { ...reminders, frozen };
    },
  };
}

export type FlutterwaveRenewalService = ReturnType<typeof createFlutterwaveRenewalService>;
