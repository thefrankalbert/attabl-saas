import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PLAN_NAMES } from '@/lib/plans/features';
import { PLAN_TOTALS } from '@/lib/billing/pricing';
import type { BillingInterval, SubscriptionPlan } from '@/types/billing';
import type { EmailService } from './email.types';
import type { FlutterwaveBillingService } from './flutterwave-billing.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Jours de grace apres la fin de la periode payee, avant le gel.
 * Le mobile money n'a aucune relance automatique: le client paie quand il y
 * pense. Trois jours couvrent un week-end sans servir gratuitement trop long.
 */
export const FLUTTERWAVE_GRACE_DAYS = 3;

const MAX_OWNERS_PER_TENANT = 3;
const BATCH_SIZE = 200;

interface DueRenewal {
  payment_id: string;
  tenant_id: string;
  plan: Exclude<SubscriptionPlan, 'enterprise'>;
  billing_interval: BillingInterval;
  period_end: string;
  reminder: 'd7' | 'd1';
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

/**
 * Horloge de periode des abonnements Flutterwave, portee par ATTABL:
 *   1. rappels par courriel 7 jours puis 1 jour avant l'echeance, avec un lien
 *      de paiement (une tentative non expiree est reutilisee, pas dupliquee);
 *   2. gel apres l'echeance + delai de grace.
 *
 * La SELECTION est faite par la base (`flutterwave_renewals_due`,
 * `flutterwave_freeze_overdue`): un restaurant est concerne si SA DERNIERE
 * periode a ete payee par Flutterwave, et un restaurant deja traite sort du
 * resultat. Aucun filtre ne depend de `stripe_subscription_id` cote client, et
 * la limite de lot ne retient jamais les memes lignes. Le dedoublonnage d'un
 * rappel est une colonne de la ligne de paiement (`reminder_d7_at`,
 * `reminder_d1_at`), ecrite d'un seul UPDATE: pas de lecture-modification.
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

  async function ownerEmails(tenantId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('admin_users')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .eq('is_active', true)
      .limit(MAX_OWNERS_PER_TENANT);
    if (error) throw new Error('Lecture des proprietaires impossible');
    return (data ?? [])
      .map((row: { email: string | null }) => row.email)
      .filter((email: string | null): email is string => !!email);
  }

  async function markReminded(due: DueRenewal): Promise<void> {
    const column = due.reminder === 'd1' ? 'reminder_d1_at' : 'reminder_d7_at';
    const { error } = await supabase
      .from('flutterwave_payments')
      .update({ [column]: now().toISOString() })
      .eq('id', due.payment_id)
      .eq('tenant_id', due.tenant_id);
    if (error) {
      logger.error('Flutterwave: rappel envoye mais non memorise', error, {
        tenantId: due.tenant_id,
      });
    }
  }

  async function remindOne(due: DueRenewal): Promise<boolean> {
    const recipients = await ownerEmails(due.tenant_id);
    if (recipients.length === 0) {
      // Personne a qui ecrire: rien a retenter, on ferme la fenetre pour que ce
      // restaurant ne revienne pas a chaque passage.
      await markReminded(due);
      return false;
    }

    const payment = await deps.billing.startPayment({
      tenantId: due.tenant_id,
      customerEmail: recipients[0],
      plan: due.plan,
      interval: due.billing_interval,
    });
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', due.tenant_id)
      .maybeSingle();
    const msLeft = new Date(due.period_end).getTime() - now().getTime();

    let sent = 0;
    for (const to of recipients) {
      const result = await deps.email.sendRenewalReminderEmail(to, {
        restaurantName: (tenantRow as { name?: string } | null)?.name ?? 'Votre restaurant',
        paymentUrl: payment.link,
        daysLeft: Math.max(1, Math.ceil(msLeft / DAY_MS)),
        periodEndLabel: formatDate(due.period_end),
        amount: PLAN_TOTALS[due.plan][due.billing_interval],
        planLabel: PLAN_NAMES[due.plan],
      });
      if (result.success) sent += 1;
    }
    // Aucun envoi reussi: rien n'est memorise, le prochain passage reessaie.
    if (sent === 0) return false;
    await markReminded(due);
    return true;
  }

  async function sendReminders(): Promise<{ reminded: number; skipped: number }> {
    const { data, error } = await supabase.rpc('flutterwave_renewals_due', {
      p_now: now().toISOString(),
      p_limit: BATCH_SIZE,
    });
    if (error) throw new Error('Lecture des echeances impossible');

    let reminded = 0;
    let skipped = 0;
    for (const due of (data ?? []) as DueRenewal[]) {
      try {
        if (await remindOne(due)) reminded += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        logger.error('Flutterwave: rappel impossible', err, { tenantId: due.tenant_id });
      }
    }
    return { reminded, skipped };
  }

  async function freezeOverdue(): Promise<number> {
    const { data, error } = await supabase.rpc('flutterwave_freeze_overdue', {
      p_now: now().toISOString(),
      p_grace: `${FLUTTERWAVE_GRACE_DAYS} days`,
      p_limit: BATCH_SIZE,
    });
    if (error) throw new Error('Gel des abonnements Flutterwave impossible');
    return typeof data === 'number' ? data : 0;
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
