import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PLAN_TOTALS } from '@/lib/billing/pricing';
import { isFlutterwaveCurrency } from '@/lib/billing/flutterwave/config';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import { computeNewPeriod } from '@/lib/billing/flutterwave/period';
import { buildTxRef, parseTxRef } from '@/lib/billing/flutterwave/tx-ref';
import { FREEZE_REASONS, updateTolerantToMissingFreezeReason } from '@/lib/billing/freeze-reason';
import { isActiveUnlessLocked } from '@/services/stripe-webhook/status';
import { ServiceError } from './errors';
import type { BillingInterval, SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

type PayablePlan = Exclude<SubscriptionPlan, 'enterprise'>;

/** Gels qu'un paiement verifie a le droit de lever. `dispute` et les causes inconnues restent geles. */
const UNFREEZABLE_REASONS: readonly string[] = [
  FREEZE_REASONS.TRIAL_EXPIRED,
  FREEZE_REASONS.PAST_DUE_OVERDUE,
  FREEZE_REASONS.STRIPE_UNPAID,
  FREEZE_REASONS.SUBSCRIPTION_DELETED,
  FREEZE_REASONS.REFUND,
  FREEZE_REASONS.FLUTTERWAVE_UNPAID,
];

/** Statuts Stripe qui interdisent un second encaissement par un autre prestataire. */
const STRIPE_LIVE_STATUSES: readonly string[] = ['active', 'trial', 'past_due'];

const MAX_PERIOD_WRITE_ATTEMPTS = 3;

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  currency: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_current_period_end: string | null;
  trial_ends_at: string | null;
  freeze_reason: string | null;
  stripe_subscription_id: string | null;
  suspended_at: string | null;
  deleted_at: string | null;
}

interface PaymentRow {
  id: string;
  tenant_id: string;
  status: 'pending' | 'successful';
  plan: PayablePlan;
  billing_interval: BillingInterval;
  amount: number | string;
  currency: string;
}

const TENANT_COLUMNS =
  'id, slug, name, currency, subscription_status, subscription_current_period_end, trial_ends_at, freeze_reason, stripe_subscription_id, suspended_at, deleted_at';

export type PaymentRejection =
  | 'NOT_SUCCESSFUL'
  | 'UNKNOWN_TX_REF'
  | 'WRONG_TENANT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'TENANT_NOT_FOUND';

export type ProcessOutcome =
  | {
      kind: 'applied';
      tenantId: string;
      plan: PayablePlan;
      interval: BillingInterval;
      periodEnd: string;
      unfrozen: boolean;
    }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: PaymentRejection };

export interface StartPaymentInput {
  tenantId: string;
  customerEmail: string;
  plan: PayablePlan;
  interval: BillingInterval;
}

export interface StartPaymentResult {
  link: string;
  txRef: string;
  amount: number;
  currency: string;
}

export interface FlutterwaveBillingDeps {
  client: FlutterwaveClient;
  /** Origine publique de l'application (pour l'URL de retour). */
  baseUrl: string;
  now?: () => Date;
}

/**
 * Encaissement d'un abonnement par Flutterwave (mobile money, carte).
 *
 * Flutterwave n'a pas de prelevement automatique fiable: UN paiement par
 * periode. Ce service lance le paiement (`startPayment`) puis l'applique
 * (`processTransaction`) apres l'avoir RELU aupres de l'API Flutterwave.
 * Le client recu est service_role: chaque requete filtre donc par tenant.
 */
export function createFlutterwaveBillingService(
  supabase: SupabaseClient,
  deps: FlutterwaveBillingDeps,
) {
  const now = deps.now ?? (() => new Date());

  async function loadTenant(tenantId: string): Promise<TenantRow | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_COLUMNS)
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL');
    return (data as TenantRow | null) ?? null;
  }

  async function revertClaim(paymentId: string, tenantId: string): Promise<void> {
    const { error } = await supabase
      .from('flutterwave_payments')
      .update({
        status: 'pending',
        flw_transaction_id: null,
        period_start: null,
        period_end: null,
      })
      .eq('id', paymentId)
      .eq('tenant_id', tenantId);
    if (error) {
      logger.error('Flutterwave: annulation de la reservation impossible', error, {
        paymentId,
        tenantId,
      });
    }
  }

  /** Ecrit plan + periode, en ne supposant pas que personne d'autre n'a touche la periode entre-temps. */
  async function applyToTenant(
    tenantId: string,
    plan: PayablePlan,
    interval: BillingInterval,
  ): Promise<{ periodStart: Date; periodEnd: Date; unfrozen: boolean } | null> {
    for (let attempt = 0; attempt < MAX_PERIOD_WRITE_ATTEMPTS; attempt += 1) {
      const tenant = await loadTenant(tenantId);
      if (!tenant || tenant.deleted_at) return null;

      const period = computeNewPeriod({
        now: now(),
        currentPeriodEnd: tenant.subscription_current_period_end,
        trialEndsAt: tenant.trial_ends_at,
        status: tenant.subscription_status,
        interval,
      });

      const frozenWithKeptCause =
        tenant.subscription_status === 'frozen' &&
        !UNFREEZABLE_REASONS.includes(tenant.freeze_reason ?? '');

      const base: Record<string, unknown> = {
        subscription_plan: plan,
        billing_interval: interval,
        subscription_current_period_start: period.start.toISOString(),
        subscription_current_period_end: period.end.toISOString(),
      };
      const payload: Record<string, unknown> = frozenWithKeptCause
        ? base
        : {
            ...base,
            subscription_status: 'active',
            is_active: isActiveUnlessLocked('active', tenant),
            past_due_since: null,
            freeze_reason: null,
          };
      if (frozenWithKeptCause) {
        logger.warn('Flutterwave: paiement recu sur un gel qui ne se leve pas par paiement', {
          tenantId,
          freezeReason: tenant.freeze_reason,
        });
      }

      const { data, error } = await updateTolerantToMissingFreezeReason(
        payload,
        (body) => {
          const query = supabase.from('tenants').update(body).eq('id', tenantId);
          const guarded = tenant.subscription_current_period_end
            ? query.eq('subscription_current_period_end', tenant.subscription_current_period_end)
            : query.is('subscription_current_period_end', null);
          return guarded.select('id');
        },
        { tenantId },
      );
      if (error) throw new ServiceError('Mise a jour de l abonnement impossible', 'INTERNAL');
      if (Array.isArray(data) && data.length > 0) {
        return {
          periodStart: period.start,
          periodEnd: period.end,
          unfrozen: tenant.subscription_status === 'frozen' && !frozenWithKeptCause,
        };
      }
      // Zero ligne: la periode a bouge sous nos pieds (second paiement simultane). On relit.
    }
    throw new ServiceError('Mise a jour de l abonnement en conflit', 'CONFLICT');
  }

  return {
    /** Cree la ligne `pending` (prix attendu) puis le lien de paiement heberge. */
    async startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
      const tenant = await loadTenant(input.tenantId);
      if (!tenant || tenant.deleted_at) {
        throw new ServiceError('Restaurant non trouve', 'NOT_FOUND');
      }
      if (!isFlutterwaveCurrency(tenant.currency)) {
        throw new ServiceError('Devise non prise en charge par le paiement mobile', 'VALIDATION');
      }
      if (
        tenant.stripe_subscription_id &&
        STRIPE_LIVE_STATUSES.includes(tenant.subscription_status ?? '')
      ) {
        throw new ServiceError('Ce restaurant a deja un abonnement par carte actif', 'CONFLICT');
      }

      const amount = PLAN_TOTALS[input.plan][input.interval];
      const txRef = buildTxRef(tenant.id, input.plan, input.interval);

      const { error: insertError } = await supabase.from('flutterwave_payments').insert({
        tenant_id: tenant.id,
        tx_ref: txRef,
        plan: input.plan,
        billing_interval: input.interval,
        amount,
        currency: tenant.currency,
        status: 'pending',
      });
      if (insertError) {
        logger.error('Flutterwave: enregistrement de la tentative impossible', insertError, {
          tenantId: tenant.id,
        });
        throw new ServiceError('Paiement indisponible', 'INTERNAL');
      }

      try {
        const link = await deps.client.createPaymentLink({
          txRef,
          amount,
          currency: tenant.currency,
          redirectUrl: `${deps.baseUrl}/sites/${tenant.slug}/admin/subscription?fw=return`,
          customer: { email: input.customerEmail, name: tenant.name },
          title: 'ATTABL',
          description: `Abonnement ${input.plan} (${input.interval === 'yearly' ? 'annuel' : 'mensuel'})`,
          meta: { tenant_id: tenant.id, plan: input.plan, interval: input.interval },
        });
        return { link, txRef, amount, currency: tenant.currency };
      } catch (error) {
        const { error: cleanupError } = await supabase
          .from('flutterwave_payments')
          .delete()
          .eq('tx_ref', txRef)
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending');
        if (cleanupError) {
          logger.warn('Flutterwave: tentative orpheline non nettoyee', { tenantId: tenant.id });
        }
        logger.error('Flutterwave: creation du lien impossible', error, { tenantId: tenant.id });
        throw new ServiceError('Paiement indisponible', 'INTERNAL');
      }
    },

    /**
     * Applique un paiement apres l'avoir RELU chez Flutterwave. Idempotent: la
     * reservation `pending -> successful` est atomique, donc un webhook rejoue
     * ou concurrent de la page de retour ne prolonge qu'UNE fois.
     *
     * @param expectedTenantId Restaurant de la session (route de confirmation).
     *   Absent pour le webhook, ou seule la ligne enregistree fait foi.
     */
    async processTransaction(
      transactionId: number,
      expectedTenantId?: string,
    ): Promise<ProcessOutcome> {
      const tx = await deps.client.verifyTransaction(transactionId);
      if (tx.status !== 'successful') return { kind: 'rejected', reason: 'NOT_SUCCESSFUL' };

      const parsedRef = parseTxRef(tx.tx_ref);
      if (!parsedRef) return { kind: 'rejected', reason: 'UNKNOWN_TX_REF' };

      const { data: found, error: findError } = await supabase
        .from('flutterwave_payments')
        .select('id, tenant_id, status, plan, billing_interval, amount, currency')
        .eq('tx_ref', tx.tx_ref)
        .eq('tenant_id', parsedRef.tenantId)
        .maybeSingle();
      if (findError) throw new ServiceError('Lecture du paiement impossible', 'INTERNAL');
      const payment = found as PaymentRow | null;
      if (!payment) return { kind: 'rejected', reason: 'UNKNOWN_TX_REF' };

      if (expectedTenantId && payment.tenant_id !== expectedTenantId) {
        return { kind: 'rejected', reason: 'WRONG_TENANT' };
      }
      if (tx.currency !== payment.currency) {
        return { kind: 'rejected', reason: 'CURRENCY_MISMATCH' };
      }
      // Doc officielle (verification): le montant paye doit etre superieur OU EGAL
      // au montant attendu. Un sous-paiement est rejete; un surplus ne bloque pas
      // un client qui a deja paye (le lien est a montant fixe, le cas est rare).
      if (tx.amount < Number(payment.amount)) {
        return { kind: 'rejected', reason: 'AMOUNT_MISMATCH' };
      }
      if (payment.status === 'successful') return { kind: 'duplicate' };

      const tenant = await loadTenant(payment.tenant_id);
      if (!tenant || tenant.deleted_at) return { kind: 'rejected', reason: 'TENANT_NOT_FOUND' };

      // Reservation atomique. La periode exacte est ecrite apres, une fois lue la
      // fin de periode courante; ici on pose l'identifiant, ce qui scelle le paiement.
      const provisional = now().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from('flutterwave_payments')
        .update({
          status: 'successful',
          flw_transaction_id: tx.id,
          period_start: provisional,
          period_end: provisional,
        })
        .eq('id', payment.id)
        .eq('tenant_id', payment.tenant_id)
        .eq('status', 'pending')
        .select('id');
      if (claimError) {
        // 23505: cette transaction Flutterwave a deja regle une autre ligne.
        if ((claimError as { code?: string }).code === '23505') return { kind: 'duplicate' };
        throw new ServiceError('Reservation du paiement impossible', 'INTERNAL');
      }
      if (!Array.isArray(claimed) || claimed.length === 0) return { kind: 'duplicate' };

      let applied: Awaited<ReturnType<typeof applyToTenant>>;
      try {
        applied = await applyToTenant(payment.tenant_id, payment.plan, payment.billing_interval);
      } catch (error) {
        await revertClaim(payment.id, payment.tenant_id);
        throw error;
      }
      if (!applied) {
        await revertClaim(payment.id, payment.tenant_id);
        return { kind: 'rejected', reason: 'TENANT_NOT_FOUND' };
      }

      const { error: periodError } = await supabase
        .from('flutterwave_payments')
        .update({
          period_start: applied.periodStart.toISOString(),
          period_end: applied.periodEnd.toISOString(),
        })
        .eq('id', payment.id)
        .eq('tenant_id', payment.tenant_id);
      if (periodError) {
        logger.error('Flutterwave: periode du registre non ecrite', periodError, {
          tenantId: payment.tenant_id,
        });
      }

      logger.info('Flutterwave: abonnement prolonge', {
        tenantId: payment.tenant_id,
        plan: payment.plan,
        interval: payment.billing_interval,
      });
      return {
        kind: 'applied',
        tenantId: payment.tenant_id,
        plan: payment.plan,
        interval: payment.billing_interval,
        periodEnd: applied.periodEnd.toISOString(),
        unfrozen: applied.unfrozen,
      };
    },
  };
}

export type FlutterwaveBillingService = ReturnType<typeof createFlutterwaveBillingService>;
